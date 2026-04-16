
"use client";

import React, { useEffect, useMemo, useState } from "react";
import rawData from "@/data/forest.json";

type AppRecord = {
  id: number;
  zone: string;
  region: string;
  name: string;
  facilityType: string;
  operatorType: string;
  firstComeRule: string;
  lotteryRule: string;
  lotteryTarget: string;
  lotteryResult: string;
  waitingOpen: string;
  note: string;
  homepage: string;
  localPriorityPolicy: string;
  recommendedRoomMemo: string;
};

type EventType = "선착순" | "추첨접수" | "추첨발표" | "미결제/대기예약";
type ViewTab = "캘린더" | "타임라인" | "숙소검색";

type CalendarEvent = AppRecord & {
  eventType: EventType;
  eventDate: string;
  eventTime: string;
  periodStartDate?: string;
  periodEndDate?: string;
};

type EventGroup = {
  groupKey: string;
  operatorType: string;
  eventType: EventType;
  eventTime: string;
  items: CalendarEvent[];
};

type TimelineDateGroup = {
  date: string;
  groups: EventGroup[];
};

const data = rawData as AppRecord[];

const operatorOptions = ["전체", "국립", "공립"];
const facilityOptions = ["전체", "자연휴양림", "생태탐방원", "캠핑장", "야영장"];
const zoneOptions = ["전체", "서울/인천/경기", "강원", "충북", "대전/충남", "전북", "광주/전남", "대구/경북", "부산/경남", "제주", "공통"];
const sortOptions = ["이름순", "권역순"] as const;
const tabOptions: ViewTab[] = ["캘린더", "타임라인", "숙소검색"];
type SortOption = (typeof sortOptions)[number];
type EventFilterOption = "전체" | EventType;
const eventFilterOptions: EventFilterOption[] = ["전체", "선착순", "추첨접수", "추첨발표", "미결제/대기예약"];

const weekdayMap: Record<string, number> = {
  일: 0,
  월: 1,
  화: 2,
  수: 3,
  목: 4,
  금: 5,
  토: 6,
};

const zoneOrder = [
  "서울/인천/경기",
  "강원",
  "충북",
  "대전/충남",
  "전북",
  "광주/전남",
  "대구/경북",
  "부산/경남",
  "제주",
  "공통",
];

function chipStyle(active: boolean, strong = false) {
  return {
    padding: "8px 14px",
    borderRadius: "999px",
    border: active ? "1px solid #166534" : "1px solid #d6d3d1",
    background: active ? (strong ? "#166534" : "#eff6ff") : "#ffffff",
    color: active ? (strong ? "#ffffff" : "#1d4ed8") : "#44403c",
    cursor: "pointer" as const,
    fontSize: "14px",
    fontWeight: 700,
  };
}

function tabStyle(active: boolean) {
  return {
    padding: "10px 16px",
    borderRadius: "12px",
    border: active ? "1px solid #166534" : "1px solid #e7e5e4",
    background: active ? "#166534" : "#ffffff",
    color: active ? "#ffffff" : "#44403c",
    cursor: "pointer" as const,
    fontSize: "14px",
    fontWeight: 800,
  };
}

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function formatDateKey(date: Date) {
  return `${date.getFullYear()}-${pad2(date.getMonth() + 1)}-${pad2(date.getDate())}`;
}

function parseDateKey(dateKey: string) {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function normalizeRuleText(text: string) {
  return (text || "")
    .replace(/\s+/g, " ")
    .replace(/잔여사이트/g, "")
    .replace(/선착순/g, "")
    .replace(/추첨/g, "")
    .trim();
}

function parseTime(text: string) {
  const normalized = normalizeRuleText(text);

  const hm = normalized.match(/(\d{1,2}):(\d{2})/);
  if (hm) return `${pad2(Number(hm[1]))}:${hm[2]}`;

  const h = normalized.match(/(\d{1,2})시/);
  if (h) {
    const hour = Number(h[1]) === 24 ? 23 : Number(h[1]);
    return `${pad2(hour)}:00`;
  }

  return "09:00";
}

function getDateRange(start: Date, end: Date) {
  const result: Date[] = [];
  const current = new Date(start);

  while (current <= end) {
    result.push(new Date(current));
    current.setDate(current.getDate() + 1);
  }

  return result;
}

function firstWeekdayOfMonth(year: number, monthIndex: number) {
  const d = new Date(year, monthIndex, 1);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() + 1);
  }
  return d;
}

function getAllWeekdaysInMonth(year: number, monthIndex: number, weekday: number) {
  const result: Date[] = [];
  const d = new Date(year, monthIndex, 1);

  while (d.getMonth() === monthIndex) {
    if (d.getDay() === weekday) {
      result.push(new Date(d));
    }
    d.setDate(d.getDate() + 1);
  }

  return result;
}

function getWeekdaysAfterDayInMonth(year: number, monthIndex: number, weekday: number, dayThreshold: number) {
  return getAllWeekdaysInMonth(year, monthIndex, weekday).filter((d) => d.getDate() > dayThreshold);
}

function parsePeriodFromText(
  ruleText: string,
  year: number,
  monthIndex: number
): { start: Date; end: Date; time: string } | null {
  const normalized = normalizeRuleText(ruleText);
  const month = monthIndex + 1;

  let m = normalized.match(
    /매\s*(짝수월|홀수월)\s*(\d{1,2})일\s*(\d{1,2})(?::(\d{2}))?시\s*~\s*(\d{1,2})일\s*(\d{1,2})(?::(\d{2}))?시/
  );
  if (m) {
    const monthType = m[1];
    const startDay = Number(m[2]);
    const startHour = Number(m[3]);
    const startMin = Number(m[4] || 0);
    const endDay = Number(m[5]);
    const endHourRaw = Number(m[6]);
    const endMin = Number(m[7] || 0);

    const isEvenMonth = month % 2 === 0;
    const shouldInclude =
      (monthType === "짝수월" && isEvenMonth) ||
      (monthType === "홀수월" && !isEvenMonth);

    if (!shouldInclude) return null;

    const endHour = endHourRaw === 24 ? 23 : endHourRaw;
    const endMinute = endHourRaw === 24 && endMin === 0 ? 59 : endMin;

    const start = new Date(year, monthIndex, startDay, startHour, startMin);
    const end = new Date(year, monthIndex, endDay, endHour, endMinute);

    if (start.getMonth() === monthIndex && end.getMonth() === monthIndex) {
      return {
        start,
        end,
        time: `${pad2(startHour)}:${pad2(startMin)}`,
      };
    }
  }

  m = normalized.match(
    /매월\s*(\d{1,2})일\s*(\d{1,2})(?::(\d{2}))?시\s*~\s*(\d{1,2})일\s*(\d{1,2})(?::(\d{2}))?시/
  );
  if (m) {
    const startDay = Number(m[1]);
    const startHour = Number(m[2]);
    const startMin = Number(m[3] || 0);
    const endDay = Number(m[4]);
    const endHourRaw = Number(m[5]);
    const endMin = Number(m[6] || 0);

    const endHour = endHourRaw === 24 ? 23 : endHourRaw;
    const endMinute = endHourRaw === 24 && endMin === 0 ? 59 : endMin;

    const start = new Date(year, monthIndex, startDay, startHour, startMin);
    const end = new Date(year, monthIndex, endDay, endHour, endMinute);

    if (start.getMonth() === monthIndex && end.getMonth() === monthIndex) {
      return {
        start,
        end,
        time: `${pad2(startHour)}:${pad2(startMin)}`,
      };
    }
  }

  m = normalized.match(/(\d{1,2})\/(\d{1,2})\s*~\s*(\d{1,2})\/(\d{1,2})/);
  if (m) {
    const start = new Date(year, Number(m[1]) - 1, Number(m[2]));
    const end = new Date(year, Number(m[3]) - 1, Number(m[4]));
    if (start.getMonth() === monthIndex || end.getMonth() === monthIndex) {
      return {
        start,
        end,
        time: parseTime(normalized),
      };
    }
  }

  return null;
}

function generateDatesFromRule(ruleText: string, year: number, monthIndex: number): { date: string; time: string }[] {
  const normalized = normalizeRuleText(ruleText);
  const time = parseTime(normalized);
  const month = monthIndex + 1;

  const biMonthlyMatch = normalized.match(/매\s*(짝수월|홀수월)\s*(\d{1,2})일/);
  if (biMonthlyMatch) {
    const monthType = biMonthlyMatch[1];
    const day = Number(biMonthlyMatch[2]);
    const isEvenMonth = month % 2 === 0;
    const shouldInclude =
      (monthType === "짝수월" && isEvenMonth) ||
      (monthType === "홀수월" && !isEvenMonth);

    if (!shouldInclude) return [];

    const d = new Date(year, monthIndex, day);
    if (d.getMonth() === monthIndex) {
      return [{ date: formatDateKey(d), time }];
    }
    return [];
  }

  if (normalized.includes("매월 첫번째 평일")) {
    const d = firstWeekdayOfMonth(year, monthIndex);
    return [{ date: formatDateKey(d), time }];
  }

  const weeklyMatch = normalized.match(/매주\s*([일월화수목금토])요일?/);
  if (weeklyMatch) {
    const weekday = weekdayMap[weeklyMatch[1]];
    return getAllWeekdaysInMonth(year, monthIndex, weekday).map((d) => ({
      date: formatDateKey(d),
      time,
    }));
  }

  const monthlyDayMatch = normalized.match(/매월\s*(\d{1,2})일/);
  if (monthlyDayMatch) {
    const day = Number(monthlyDayMatch[1]);
    const d = new Date(year, monthIndex, day);
    if (d.getMonth() === monthIndex) {
      return [{ date: formatDateKey(d), time }];
    }
    return [];
  }

  return [];
}

function summarizeZones(items: CalendarEvent[]) {
  const counts: Record<string, number> = {};
  for (const item of items) {
    const key = item.zone || "기타";
    counts[key] = (counts[key] || 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([zone, count]) => `${zone} ${count}`)
    .join(" · ");
}

function sampleNames(items: CalendarEvent[]) {
  const names = [...new Set(items.map((item) => item.name))];
  const preview = names.slice(0, 3).join(" · ");
  const remain = names.length - 3;
  return remain > 0 ? `${preview} 외 ${remain}곳` : preview;
}

function getMonthMatrix(year: number, monthIndex: number) {
  const first = new Date(year, monthIndex, 1);
  const last = new Date(year, monthIndex + 1, 0);

  const start = new Date(first);
  start.setDate(start.getDate() - start.getDay());

  const end = new Date(last);
  end.setDate(end.getDate() + (6 - end.getDay()));

  const weeks: Date[][] = [];
  const current = new Date(start);

  while (current <= end) {
    const week: Date[] = [];
    for (let i = 0; i < 7; i++) {
      week.push(new Date(current));
      current.setDate(current.getDate() + 1);
    }
    weeks.push(week);
  }

  return weeks;
}

function getEventTypeLabel(eventType: EventType) {
  switch (eventType) {
    case "선착순":
      return "선착순";
    case "추첨접수":
      return "추첨 접수";
    case "추첨발표":
      return "추첨 발표";
    case "미결제/대기예약":
      return "미결제/대기";
    default:
      return eventType;
  }
}

function getOperatorOrder(operatorType: string) {
  if (operatorType === "국립") return 0;
  if (operatorType === "공립") return 1;
  return 9;
}

function getEventTypeOrder(eventType: EventType) {
  if (eventType === "선착순") return 0;
  if (eventType === "추첨접수") return 1;
  if (eventType === "추첨발표") return 2;
  if (eventType === "미결제/대기예약") return 3;
  return 9;
}

function getZoneOrder(zone: string) {
  const index = zoneOrder.indexOf(zone);
  return index >= 0 ? index : 99;
}

function sortItems<T extends { zone?: string; name?: string; region?: string }>(
  items: T[],
  sortMode: SortOption
) {
  return [...items].sort((a, b) => {
    const aZone = a.zone || "";
    const bZone = b.zone || "";
    const aName = a.name || "";
    const bName = b.name || "";
    const aRegion = a.region || "";
    const bRegion = b.region || "";

    if (sortMode === "권역순") {
      return (
        getZoneOrder(aZone) - getZoneOrder(bZone) ||
        aName.localeCompare(bName) ||
        aRegion.localeCompare(bRegion)
      );
    }

    return (
      aName.localeCompare(bName) ||
      getZoneOrder(aZone) - getZoneOrder(bZone) ||
      aRegion.localeCompare(bRegion)
    );
  });
}

function getOperatorChipStyle(operatorType: string) {
  if (operatorType === "국립") {
    return {
      background: "#dbeafe",
      color: "#1d4ed8",
    };
  }
  return {
    background: "#dcfce7",
    color: "#166534",
  };
}

function getEventTypeChipStyle(eventType: EventType) {
  if (eventType === "추첨접수") {
    return {
      background: "#fef3c7",
      color: "#b45309",
      border: "1px solid #fcd34d",
    };
  }
  if (eventType === "추첨발표") {
    return {
      background: "#ede9fe",
      color: "#6d28d9",
      border: "1px solid #c4b5fd",
    };
  }
  if (eventType === "미결제/대기예약") {
    return {
      background: "#fee2e2",
      color: "#b91c1c",
      border: "1px solid #fca5a5",
    };
  }
  return {
    background: "#ffffff",
    color: "#44403c",
    border: "1px solid #d6d3d1",
  };
}

function buildEventsForItem(item: AppRecord, year: number, monthIndex: number): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  if (item.firstComeRule) {
    const generated = generateDatesFromRule(item.firstComeRule, year, monthIndex);
    generated.forEach((g) => {
      events.push({
        ...item,
        eventType: "선착순",
        eventDate: g.date,
        eventTime: g.time,
      });
    });
  }

  if (item.lotteryRule) {
    const period = parsePeriodFromText(item.lotteryRule, year, monthIndex);
    if (period) {
      const dates = getDateRange(period.start, period.end).filter((d) => d.getMonth() === monthIndex);

      dates.forEach((d) => {
        events.push({
          ...item,
          eventType: "추첨접수",
          eventDate: formatDateKey(d),
          eventTime: period.time,
          periodStartDate: formatDateKey(period.start),
          periodEndDate: formatDateKey(period.end),
        });
      });
    } else {
      const generated = generateDatesFromRule(item.lotteryRule, year, monthIndex);
      generated.forEach((g) => {
        events.push({
          ...item,
          eventType: "추첨접수",
          eventDate: g.date,
          eventTime: g.time,
        });
      });
    }
  }

  if (item.lotteryResult) {
    const generated = generateDatesFromRule(item.lotteryResult, year, monthIndex);
    generated.forEach((g) => {
      events.push({
        ...item,
        eventType: "추첨발표",
        eventDate: g.date,
        eventTime: g.time,
      });
    });
  }

  if (item.waitingOpen) {
    const generated = generateDatesFromRule(item.waitingOpen, year, monthIndex);
    generated.forEach((g) => {
      events.push({
        ...item,
        eventType: "미결제/대기예약",
        eventDate: g.date,
        eventTime: g.time,
      });
    });

    const shouldAddRollingWednesdayWaitingOpen =
      item.operatorType === "국립" &&
      item.facilityType === "자연휴양림" &&
      item.waitingOpen.includes("매월 15일") &&
      item.note.includes("6주차");

    if (shouldAddRollingWednesdayWaitingOpen) {
      const extraWednesdays = getWeekdaysAfterDayInMonth(year, monthIndex, 3, 15);

      extraWednesdays.forEach((date) => {
        const dateKey = formatDateKey(date);
        const alreadyExists = events.some(
          (event) =>
            event.eventType === "미결제/대기예약" &&
            event.eventDate === dateKey &&
            event.name === item.name
        );

        if (!alreadyExists) {
          events.push({
            ...item,
            eventType: "미결제/대기예약",
            eventDate: dateKey,
            eventTime: "09:00",
          });
        }
      });
    }
  }

  return events;
}

function getRuleSummary(item: AppRecord) {
  const lines = [
    item.firstComeRule ? `선착순 · ${item.firstComeRule}` : "",
    item.lotteryRule ? `추첨접수 · ${item.lotteryRule}` : "",
    item.lotteryResult ? `추첨발표 · ${item.lotteryResult}` : "",
    item.waitingOpen ? `미결제/대기 · ${item.waitingOpen}` : "",
  ].filter(Boolean);

  return lines;
}

function getDateLabel(dateKey: string) {
  const d = parseDateKey(dateKey);
  const weekday = ["일", "월", "화", "수", "목", "금", "토"][d.getDay()];
  return `${d.getMonth() + 1}월 ${d.getDate()}일 (${weekday})`;
}

export default function Home() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [isClient, setIsClient] = useState(false);
  const [todayKey, setTodayKey] = useState("");
  const [selectedOperator, setSelectedOperator] = useState("전체");
  const [selectedFacility, setSelectedFacility] = useState("전체");
  const [selectedZone, setSelectedZone] = useState("전체");
  const [selectedEventFilter, setSelectedEventFilter] = useState<EventFilterOption>("전체");
  const [sortMode, setSortMode] = useState<SortOption>("이름순");
  const [activeTab, setActiveTab] = useState<ViewTab>("캘린더");
  const [query, setQuery] = useState("");
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedGroupKey, setSelectedGroupKey] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  useEffect(() => {
    const now = new Date();
    setTodayKey(formatDateKey(now));
    setIsClient(true);
  }, []);

  const filteredRules = useMemo(() => {
    const q = query.trim().toLowerCase();

    return data.filter((item) => {
      const facilityTypeText = (item.facilityType || "").replace(/\s+/g, "");
      const selectedFacilityText = selectedFacility.replace(/\s+/g, "");

      const matchesOperator =
        selectedOperator === "전체" || item.operatorType === selectedOperator;

      const matchesFacility =
        selectedFacility === "전체" ||
        facilityTypeText === selectedFacilityText ||
        facilityTypeText.includes(selectedFacilityText);

      const matchesZone =
        selectedZone === "전체" || item.zone === selectedZone;

      const haystack = [
        item.name,
        item.region,
        item.zone,
        item.firstComeRule,
        item.lotteryRule,
        item.lotteryTarget,
        item.lotteryResult,
        item.waitingOpen,
        item.note,
      ]
        .join(" ")
        .toLowerCase();

      const matchesQuery = !q || haystack.includes(q);

      return matchesOperator && matchesFacility && matchesZone && matchesQuery;
    });
  }, [selectedOperator, selectedFacility, selectedZone, query]);

  const calendarEvents = useMemo(() => {
    const events: CalendarEvent[] = [];
    filteredRules.forEach((item) => {
      events.push(...buildEventsForItem(item, viewYear, viewMonth));
    });
    return events;
  }, [filteredRules, viewYear, viewMonth]);

  const visibleEvents = useMemo(() => {
    if (selectedEventFilter === "전체") return calendarEvents;
    return calendarEvents.filter((event) => event.eventType === selectedEventFilter);
  }, [calendarEvents, selectedEventFilter]);

  const eventCountByDate = useMemo(() => {
    const map: Record<string, number> = {};
    visibleEvents.forEach((e) => {
      map[e.eventDate] = (map[e.eventDate] || 0) + 1;
    });
    return map;
  }, [visibleEvents]);

  const eventsForSelectedDate = useMemo(() => {
    if (!selectedDate) return [];
    return visibleEvents.filter((e) => e.eventDate === selectedDate);
  }, [visibleEvents, selectedDate]);

  const groupedForSelectedDate = useMemo<EventGroup[]>(() => {
    const groups: Record<string, CalendarEvent[]> = {};

    for (const item of eventsForSelectedDate) {
      const key = `${item.operatorType}__${item.eventType}__${item.eventTime}`;
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    }

    return Object.entries(groups)
      .map(([groupKey, items]) => {
        const first = items[0];
        return {
          groupKey,
          operatorType: first.operatorType,
          eventType: first.eventType,
          eventTime: first.eventTime,
          items: sortItems(items, sortMode),
        };
      })
      .sort(
        (a, b) =>
          getOperatorOrder(a.operatorType) - getOperatorOrder(b.operatorType) ||
          getEventTypeOrder(a.eventType) - getEventTypeOrder(b.eventType) ||
          a.eventTime.localeCompare(b.eventTime)
      );
  }, [eventsForSelectedDate, sortMode]);

  const currentGroup = useMemo(() => {
    if (!groupedForSelectedDate.length) return null;
    return groupedForSelectedDate.find((group) => group.groupKey === selectedGroupKey) || groupedForSelectedDate[0];
  }, [groupedForSelectedDate, selectedGroupKey]);

  const timelineGroups = useMemo<TimelineDateGroup[]>(() => {
    const dateMap: Record<string, CalendarEvent[]> = {};

    visibleEvents
      .filter((event) => todayKey && event.eventDate >= todayKey)
      .forEach((event) => {
        if (!dateMap[event.eventDate]) dateMap[event.eventDate] = [];
        dateMap[event.eventDate].push(event);
      });

    return Object.entries(dateMap)
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([date, items]) => {
        const groupedMap: Record<string, CalendarEvent[]> = {};

        items.forEach((item) => {
          const key = `${item.operatorType}__${item.eventType}__${item.eventTime}`;
          if (!groupedMap[key]) groupedMap[key] = [];
          groupedMap[key].push(item);
        });

        const groups = Object.entries(groupedMap)
          .map(([groupKey, groupedItems]) => {
            const first = groupedItems[0];
            return {
              groupKey,
              operatorType: first.operatorType,
              eventType: first.eventType,
              eventTime: first.eventTime,
              items: sortItems(groupedItems, sortMode),
            };
          })
          .sort(
            (a, b) =>
              getOperatorOrder(a.operatorType) - getOperatorOrder(b.operatorType) ||
              getEventTypeOrder(a.eventType) - getEventTypeOrder(b.eventType) ||
              a.eventTime.localeCompare(b.eventTime)
          );

        return { date, groups };
      });
  }, [visibleEvents, sortMode, todayKey]);

  const searchableItems = useMemo(() => sortItems(filteredRules, sortMode), [filteredRules, sortMode]);

  const monthMatrix = useMemo(() => getMonthMatrix(viewYear, viewMonth), [viewYear, viewMonth]);
  const monthLabel = `${viewYear}년 ${viewMonth + 1}월`;

  const selectedDateLabel = useMemo(() => {
    if (!selectedDate) return "";
    return getDateLabel(selectedDate);
  }, [selectedDate]);

  function moveMonth(diff: number) {
    const next = new Date(viewYear, viewMonth + diff, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
    setSelectedDate(null);
    setSelectedGroupKey(null);
    setIsModalOpen(false);
  }

  function closeModal() {
    setIsModalOpen(false);
    setSelectedGroupKey(null);
  }

  function openDateModal(dateKey: string) {
    setSelectedDate(dateKey);
    setSelectedGroupKey(null);
    setIsModalOpen(true);
  }

  function toggleExpand(key: string) {
    setExpandedItems((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  }

  if (!isClient) return null;

  return (
    <main
      style={{
        minHeight: "100vh",
        background: "#f8f7f4",
        color: "#292524",
        padding: "24px",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <div style={{ maxWidth: "1180px", margin: "0 auto" }}>
        <div
          style={{
            background: "#ffffff",
            border: "1px solid #e7e5e4",
            borderRadius: "24px",
            padding: "20px",
            marginBottom: "24px",
            boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "16px",
              flexWrap: "wrap",
              marginBottom: "16px",
            }}
          >
            <div>
              <h1 style={{ margin: 0, fontSize: "32px" }}>숙소 예약 오픈 캘린더</h1>
              <p style={{ margin: "8px 0 0", color: "#78716c" }}>
                자연휴양림 · 캠핑장 · 공공숙소 예약 일정을 한눈에 확인
              </p>
            </div>
            <div style={{ color: "#57534e", fontWeight: 700 }}>
              {monthLabel} · {visibleEvents.length}개 일정
            </div>
          </div>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "16px" }}>
            {tabOptions.map((tab) => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={tabStyle(activeTab === tab)}>
                {tab}
              </button>
            ))}
          </div>

          <div style={{ display: "grid", gap: "12px", marginBottom: "18px" }}>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="시설명, 지역, 권역, 규칙 검색"
              style={{
                width: "100%",
                padding: "12px 14px",
                borderRadius: "14px",
                border: "1px solid #d6d3d1",
                fontSize: "14px",
                outline: "none",
              }}
            />

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 700, marginRight: "4px" }}>빠른필터</span>
              {eventFilterOptions.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedEventFilter(type);
                    setSelectedDate(null);
                    setSelectedGroupKey(null);
                    setIsModalOpen(false);
                  }}
                  style={chipStyle(selectedEventFilter === type, false)}
                >
                  {type === "추첨접수" ? "추첨접수" : type === "미결제/대기예약" ? "미결제/대기" : type}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 700, marginRight: "4px" }}>운영주체</span>
              {operatorOptions.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedOperator(type);
                    setSelectedDate(null);
                    setSelectedGroupKey(null);
                    setIsModalOpen(false);
                  }}
                  style={chipStyle(selectedOperator === type, true)}
                >
                  {type}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 700, marginRight: "4px" }}>시설유형</span>
              {facilityOptions.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedFacility(type);
                    setSelectedDate(null);
                    setSelectedGroupKey(null);
                    setIsModalOpen(false);
                  }}
                  style={chipStyle(selectedFacility === type, false)}
                >
                  {type}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 700, marginRight: "4px" }}>권역</span>
              {zoneOptions.map((type) => (
                <button
                  key={type}
                  onClick={() => {
                    setSelectedZone(type);
                    setSelectedDate(null);
                    setSelectedGroupKey(null);
                    setIsModalOpen(false);
                  }}
                  style={chipStyle(selectedZone === type, false)}
                >
                  {type}
                </button>
              ))}
            </div>

            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
              <span style={{ fontWeight: 700, marginRight: "4px" }}>정렬</span>
              {sortOptions.map((type) => (
                <button key={type} onClick={() => setSortMode(type)} style={chipStyle(sortMode === type, false)}>
                  {type}
                </button>
              ))}
            </div>
          </div>

          {activeTab === "캘린더" && (
            <div
              style={{
                borderTop: "1px solid #eee7df",
                paddingTop: "14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "14px",
                }}
              >
                <button
                  onClick={() => moveMonth(-1)}
                  style={{
                    border: "1px solid #e7e5e4",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "18px",
                    color: "#57534e",
                    borderRadius: "12px",
                    width: "40px",
                    height: "40px",
                    flexShrink: 0,
                  }}
                >
                  ‹
                </button>

                <div style={{ fontSize: "30px", fontWeight: 800 }}>{monthLabel}</div>

                <button
                  onClick={() => moveMonth(1)}
                  style={{
                    border: "1px solid #e7e5e4",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "18px",
                    color: "#57534e",
                    borderRadius: "12px",
                    width: "40px",
                    height: "40px",
                    flexShrink: 0,
                  }}
                >
                  ›
                </button>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(7, 1fr)",
                  gap: "0",
                  borderTop: "1px solid #eee7df",
                  borderLeft: "1px solid #eee7df",
                }}
              >
                {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
                  <div
                    key={day}
                    style={{
                      padding: "10px 8px",
                      textAlign: "center",
                      fontWeight: 700,
                      color: i === 0 ? "#ef4444" : i === 6 ? "#2563eb" : "#57534e",
                      borderRight: "1px solid #eee7df",
                      borderBottom: "1px solid #eee7df",
                      background: "#fcfbf8",
                    }}
                  >
                    {day}
                  </div>
                ))}

                {monthMatrix.flat().map((date) => {
                  const inMonth = date.getMonth() === viewMonth;
                  const key = formatDateKey(date);
                  const count = eventCountByDate[key] || 0;
                  const isSelected = selectedDate === key;

                  return (
                    <button
                      key={key}
                      onClick={() => {
                        if (!inMonth) return;
                        openDateModal(key);
                      }}
                      style={{
                        minHeight: "110px",
                        border: "none",
                        borderRight: "1px solid #eee7df",
                        borderBottom: "1px solid #eee7df",
                        background: isSelected ? "#eff6ff" : inMonth ? "#ffffff" : "#f5f5f4",
                        padding: "10px",
                        textAlign: "left",
                        cursor: inMonth ? "pointer" : "default",
                        position: "relative",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: isSelected ? 800 : 500,
                          color: inMonth ? "#292524" : "#a8a29e",
                        }}
                      >
                        {date.getDate()}
                      </div>

                      {count > 0 && (
                        <div
                          style={{
                            position: "absolute",
                            right: "10px",
                            bottom: "10px",
                            background: "#d9f5dd",
                            color: "#166534",
                            borderRadius: "999px",
                            padding: "4px 8px",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {count}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {activeTab === "타임라인" && (
            <div
              style={{
                borderTop: "1px solid #eee7df",
                paddingTop: "14px",
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  alignItems: "center",
                  gap: "12px",
                  marginBottom: "18px",
                }}
              >
                <button
                  onClick={() => moveMonth(-1)}
                  style={{
                    border: "1px solid #e7e5e4",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "18px",
                    color: "#57534e",
                    borderRadius: "12px",
                    width: "40px",
                    height: "40px",
                  }}
                >
                  ‹
                </button>

                <div style={{ fontSize: "30px", fontWeight: 800 }}>{monthLabel}</div>

                <button
                  onClick={() => moveMonth(1)}
                  style={{
                    border: "1px solid #e7e5e4",
                    background: "#ffffff",
                    cursor: "pointer",
                    fontSize: "18px",
                    color: "#57534e",
                    borderRadius: "12px",
                    width: "40px",
                    height: "40px",
                  }}
                >
                  ›
                </button>
              </div>

              {timelineGroups.length ? (
                <div style={{ display: "grid", gap: "14px" }}>
                  {timelineGroups.map((dateGroup) => (
                    <div
                      key={dateGroup.date}
                      onClick={() => openDateModal(dateGroup.date)}
                      style={{
                        background: "#fafaf9",
                        border: "1px solid #e7e5e4",
                        borderRadius: "18px",
                        padding: "16px",
                        cursor: "pointer",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: "12px",
                          marginBottom: "14px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ fontSize: "20px", fontWeight: 800 }}>{getDateLabel(dateGroup.date)}</div>
                        <div style={{ color: "#78716c", fontSize: "14px", fontWeight: 700 }}>›</div>
                      </div>

                      <div style={{ display: "grid", gap: "10px" }}>
                        {dateGroup.groups.map((group) => {
                          const operatorChip = getOperatorChipStyle(group.operatorType);
                          const eventChip = getEventTypeChipStyle(group.eventType);

                          return (
                            <div
                              key={group.groupKey}
                              style={{
                                background: "#ffffff",
                                border: "1px solid #ece7df",
                                borderRadius: "14px",
                                padding: "12px",
                              }}
                            >
                              <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                                <span
                                  style={{
                                    background: "#166534",
                                    color: "#ffffff",
                                    borderRadius: "999px",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {group.eventTime}
                                </span>
                                <span
                                  style={{
                                    background: operatorChip.background,
                                    color: operatorChip.color,
                                    borderRadius: "999px",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {group.operatorType}
                                </span>
                                <span
                                  style={{
                                    background: eventChip.background,
                                    color: eventChip.color,
                                    border: eventChip.border,
                                    borderRadius: "999px",
                                    padding: "4px 8px",
                                    fontSize: "12px",
                                    fontWeight: 700,
                                  }}
                                >
                                  {getEventTypeLabel(group.eventType)}
                                </span>
                              </div>

                              <div style={{ fontWeight: 700, fontSize: "15px", marginBottom: "6px" }}>
                                {group.items.length}개 시설
                              </div>
                              <div style={{ color: "#78716c", fontSize: "13px" }}>
                                {summarizeZones(group.items)}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    background: "#fff",
                    border: "1px dashed #d6d3d1",
                    borderRadius: "24px",
                    padding: "40px",
                    textAlign: "center",
                    color: "#78716c",
                  }}
                >
                  이번 달에는 표시할 일정이 없습니다.
                </div>
              )}
            </div>
          )}

          {activeTab === "숙소검색" && (
            <div
              style={{
                borderTop: "1px solid #eee7df",
                paddingTop: "14px",
              }}
            >
              <div style={{ color: "#78716c", marginBottom: "16px" }}>
                검색어와 필터에 맞는 숙소를 시설 중심으로 확인할 수 있습니다.
              </div>

              {searchableItems.length ? (
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
                    gap: "12px",
                  }}
                >
                  {searchableItems.map((item) => (
                    <div
                      key={item.id}
                      style={{
                        background: "#fafaf9",
                        border: "1px solid #e7e5e4",
                        borderRadius: "18px",
                        padding: "16px",
                      }}
                    >
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                        <span
                          style={{
                            background: "#eef2ff",
                            color: "#4338ca",
                            borderRadius: "999px",
                            padding: "5px 9px",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {item.zone}
                        </span>
                        <span
                          style={{
                            background: "#e7f7ea",
                            color: "#166534",
                            borderRadius: "999px",
                            padding: "5px 9px",
                            fontSize: "12px",
                            fontWeight: 700,
                          }}
                        >
                          {item.region}
                        </span>
                      </div>

                      <div style={{ fontWeight: 800, fontSize: "18px", marginBottom: "8px" }}>{item.name}</div>
                      <div style={{ color: "#57534e", fontSize: "14px", marginBottom: "10px" }}>
                        {item.facilityType} · {item.operatorType}
                      </div>

                      <div style={{ display: "grid", gap: "6px", marginBottom: "10px" }}>
                        {getRuleSummary(item).map((line) => (
                          <div key={line} style={{ fontSize: "13px", color: "#1f2937", lineHeight: 1.5 }}>
                            {line}
                          </div>
                        ))}
                      </div>

                      {item.lotteryTarget ? (
                        <div style={{ color: "#78716c", fontSize: "13px", marginBottom: "6px", lineHeight: 1.5 }}>
                          추첨대상 · {item.lotteryTarget}
                        </div>
                      ) : null}

                      {item.note ? (
                        <div style={{ color: "#78716c", fontSize: "13px", marginBottom: item.homepage ? "8px" : "0" }}>
                          비고 · {item.note}
                        </div>
                      ) : null}

                      {item.homepage ? (
                        <a
                          href={item.homepage}
                          target="_blank"
                          rel="noreferrer"
                          style={{ color: "#2563eb", fontSize: "13px" }}
                        >
                          홈페이지 바로가기
                        </a>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : (
                <div
                  style={{
                    background: "#fff",
                    border: "1px dashed #d6d3d1",
                    borderRadius: "24px",
                    padding: "40px",
                    textAlign: "center",
                    color: "#78716c",
                  }}
                >
                  조건에 맞는 숙소가 없습니다.
                </div>
              )}
            </div>
          )}
        </div>

        {isModalOpen && selectedDate && (
          <div
            onClick={closeModal}
            style={{
              position: "fixed",
              inset: 0,
              background: "rgba(0,0,0,0.45)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              padding: "20px",
              zIndex: 1000,
            }}
          >
            <div
              onClick={(e) => e.stopPropagation()}
              style={{
                width: "min(1200px, 100%)",
                height: "min(88vh, 900px)",
                overflow: "hidden",
                background: "#ffffff",
                borderRadius: "24px",
                boxShadow: "0 20px 50px rgba(0,0,0,0.2)",
                display: "grid",
                gridTemplateColumns: "320px 1fr",
                minHeight: 0,
              }}
            >
              <section
                style={{
                  borderRight: "1px solid #e7e5e4",
                  padding: "20px",
                  overflowY: "auto",
                  minHeight: 0,
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    gap: "12px",
                    marginBottom: "16px",
                  }}
                >
                  <div>
                    <div style={{ fontSize: "22px", fontWeight: 800, marginBottom: "6px" }}>
                      {selectedDateLabel}
                    </div>
                    <div style={{ color: "#78716c" }}>{eventsForSelectedDate.length}개 일정</div>
                  </div>

                  <button
                    onClick={closeModal}
                    style={{
                      border: "none",
                      background: "#f5f5f4",
                      borderRadius: "999px",
                      width: "40px",
                      height: "40px",
                      cursor: "pointer",
                      fontSize: "20px",
                      fontWeight: 700,
                      color: "#57534e",
                      flexShrink: 0,
                    }}
                  >
                    ×
                  </button>
                </div>

                <div style={{ display: "grid", gap: "10px" }}>
                  {groupedForSelectedDate.map((group) => {
                    const active = currentGroup?.groupKey === group.groupKey;
                    const operatorChip = getOperatorChipStyle(group.operatorType);
                    const eventChip = getEventTypeChipStyle(group.eventType);

                    return (
                      <button
                        key={group.groupKey}
                        onClick={() => setSelectedGroupKey(group.groupKey)}
                        style={{
                          width: "100%",
                          border: active ? "2px solid #2563eb" : "1px solid #e7e5e4",
                          background: active ? "#eff6ff" : "#ffffff",
                          borderRadius: "16px",
                          padding: "12px",
                          textAlign: "left",
                          cursor: "pointer",
                        }}
                      >
                        <div style={{ display: "flex", gap: "6px", flexWrap: "wrap", marginBottom: "8px" }}>
                          <span
                            style={{
                              background: "#166534",
                              color: "#ffffff",
                              borderRadius: "999px",
                              padding: "4px 8px",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {group.eventTime}
                          </span>

                          <span
                            style={{
                              background: operatorChip.background,
                              color: operatorChip.color,
                              borderRadius: "999px",
                              padding: "4px 8px",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {group.operatorType}
                          </span>

                          <span
                            style={{
                              background: eventChip.background,
                              color: eventChip.color,
                              border: eventChip.border,
                              borderRadius: "999px",
                              padding: "4px 8px",
                              fontSize: "12px",
                              fontWeight: 700,
                            }}
                          >
                            {getEventTypeLabel(group.eventType)}
                          </span>
                        </div>

                        <div style={{ fontWeight: 800, fontSize: "15px", lineHeight: 1.45, marginBottom: "6px" }}>
                          {group.items.length}개 시설
                        </div>

                        <div style={{ color: "#78716c", fontSize: "13px" }}>{summarizeZones(group.items)}</div>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section
                style={{
                  padding: "20px",
                  overflowY: "auto",
                  minHeight: 0,
                  background: "#fcfcfb",
                }}
              >
                {currentGroup ? (
                  <div
                    style={{
                      background: "#ffffff",
                      border: "1px solid #e7e5e4",
                      borderRadius: "24px",
                      padding: "20px",
                      minHeight: 0,
                    }}
                  >
                    <div style={{ marginBottom: "18px" }}>
                      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "12px" }}>
                        <span
                          style={{
                            background: "#166534",
                            color: "#fff",
                            borderRadius: "999px",
                            padding: "6px 10px",
                            fontSize: "13px",
                            fontWeight: 700,
                          }}
                        >
                          {currentGroup.eventTime}
                        </span>

                        <span
                          style={{
                            background: getOperatorChipStyle(currentGroup.operatorType).background,
                            color: getOperatorChipStyle(currentGroup.operatorType).color,
                            borderRadius: "999px",
                            padding: "6px 10px",
                            fontSize: "13px",
                            fontWeight: 700,
                          }}
                        >
                          {currentGroup.operatorType}
                        </span>

                        <span
                          style={{
                            background: getEventTypeChipStyle(currentGroup.eventType).background,
                            color: getEventTypeChipStyle(currentGroup.eventType).color,
                            border: getEventTypeChipStyle(currentGroup.eventType).border,
                            borderRadius: "999px",
                            padding: "6px 10px",
                            fontSize: "13px",
                            fontWeight: 700,
                          }}
                        >
                          {getEventTypeLabel(currentGroup.eventType)}
                        </span>
                      </div>

                      <h2 style={{ margin: 0, fontSize: "30px" }}>
                        {currentGroup.operatorType} · {getEventTypeLabel(currentGroup.eventType)} · {currentGroup.eventTime}
                      </h2>

                      <div style={{ color: "#78716c", marginTop: "8px" }}>
                        {currentGroup.items.length}개 시설 · {summarizeZones(currentGroup.items)}
                      </div>
                    </div>

                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                        gap: "12px",
                      }}
                    >
                      {currentGroup.items.map((item) => (
                        <div
                          key={`${item.id}_${item.eventDate}_${item.eventType}`}
                          style={{
                            background: "#fafaf9",
                            border: "1px solid #e7e5e4",
                            borderRadius: "18px",
                            padding: "16px",
                          }}
                        >
                          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
                            <span
                              style={{
                                background: "#eef2ff",
                                color: "#4338ca",
                                borderRadius: "999px",
                                padding: "5px 9px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {item.zone}
                            </span>

                            <span
                              style={{
                                background: "#e7f7ea",
                                color: "#166534",
                                borderRadius: "999px",
                                padding: "5px 9px",
                                fontSize: "12px",
                                fontWeight: 700,
                              }}
                            >
                              {item.region}
                            </span>
                          </div>

                          <div style={{ fontWeight: 800, fontSize: "17px", marginBottom: "8px" }}>
                            {item.name}
                          </div>

                          <div style={{ color: "#57534e", fontSize: "14px", marginBottom: "6px" }}>
                            {item.facilityType} · {item.operatorType}
                          </div>

                          {item.eventType === "선착순" && item.firstComeRule ? (
                            <div style={{ color: "#1d4ed8", fontSize: "13px", fontWeight: 700, marginBottom: "6px", lineHeight: 1.5 }}>
                              {item.firstComeRule}
                            </div>
                          ) : null}

                          {item.eventType === "추첨접수" && item.lotteryRule ? (
                            <div style={{ color: "#b45309", fontSize: "13px", fontWeight: 700, marginBottom: "6px", lineHeight: 1.5 }}>
                              {item.lotteryRule}
                            </div>
                          ) : null}

                          {item.eventType === "추첨발표" && item.lotteryResult ? (
                            <div style={{ color: "#6d28d9", fontSize: "13px", fontWeight: 700, marginBottom: "6px", lineHeight: 1.5 }}>
                              {item.lotteryResult}
                            </div>
                          ) : null}

                          {item.eventType === "미결제/대기예약" && item.waitingOpen ? (
                            <div style={{ color: "#b91c1c", fontSize: "13px", fontWeight: 700, marginBottom: "6px", lineHeight: 1.5 }}>
                              {item.waitingOpen}
                            </div>
                          ) : null}

                          {item.lotteryTarget ? (
                            <div style={{ color: "#78716c", fontSize: "13px", marginBottom: "6px", lineHeight: 1.5 }}>
                              추첨대상 · {item.lotteryTarget}
                            </div>
                          ) : null}

                          {item.note ? (
                            <div
                              style={{
                                color: "#78716c",
                                fontSize: "13px",
                                lineHeight: 1.5,
                                marginBottom: item.homepage ? "8px" : "0",
                              }}
                            >
                              비고 · {item.note}
                            </div>
                          ) : null}

                          {item.localPriorityPolicy ? (
                            <div style={{ marginBottom: "6px" }}>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleExpand(
                                    `${item.id}_${item.eventDate}_${item.eventType}_policy`
                                  )
                                }
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  padding: 0,
                                  color: "#dc2626",
                                  fontSize: "13px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                📌 우선예약{" "}
                                {expandedItems[
                                  `${item.id}_${item.eventDate}_${item.eventType}_policy`
                                ]
                                  ? "▲ 접기"
                                  : "▼ 더보기"}
                              </button>

                              {expandedItems[
                                `${item.id}_${item.eventDate}_${item.eventType}_policy`
                              ] ? (
                                <div
                                  style={{
                                    color: "#dc2626",
                                    fontSize: "13px",
                                    lineHeight: 1.5,
                                    marginTop: "4px",
                                    whiteSpace: "pre-line",
                                  }}
                                >
                                  {item.localPriorityPolicy}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {item.recommendedRoomMemo ? (
                            <div style={{ marginBottom: "6px" }}>
                              <button
                                type="button"
                                onClick={() =>
                                  toggleExpand(
                                    `${item.id}_${item.eventDate}_${item.eventType}_recommended`
                                  )
                                }
                                style={{
                                  border: "none",
                                  background: "transparent",
                                  padding: 0,
                                  color: "#2563eb",
                                  fontSize: "13px",
                                  fontWeight: 700,
                                  cursor: "pointer",
                                }}
                              >
                                ⭐ 추천객실{" "}
                                {expandedItems[
                                  `${item.id}_${item.eventDate}_${item.eventType}_recommended`
                                ]
                                  ? "▲ 접기"
                                  : "▼ 더보기"}
                              </button>

                              {expandedItems[
                                `${item.id}_${item.eventDate}_${item.eventType}_recommended`
                              ] ? (
                                <div
                                  style={{
                                    color: "#2563eb",
                                    fontSize: "13px",
                                    lineHeight: 1.5,
                                    marginTop: "4px",
                                    whiteSpace: "pre-line",
                                  }}
                                >
                                  {item.recommendedRoomMemo}
                                </div>
                              ) : null}
                            </div>
                          ) : null}
                          {item.homepage ? (
                            <a
                              href={item.homepage}
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: "#2563eb", fontSize: "13px" }}
                            >
                              홈페이지 바로가기
                            </a>
                          ) : null}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    style={{
                      background: "#fff",
                      border: "1px dashed #d6d3d1",
                      borderRadius: "24px",
                      padding: "40px",
                      textAlign: "center",
                      color: "#78716c",
                    }}
                  >
                    선택한 날짜에 해당하는 일정이 없습니다.
                  </div>
                )}
              </section>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
