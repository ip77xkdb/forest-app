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
const zoneOptions = [
  "전체",
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
const sortOptions = ["이름순", "권역순"] as const;
const tabOptions: ViewTab[] = ["캘린더", "타임라인", "숙소검색"];
type SortOption = (typeof sortOptions)[number];
type EventFilterOption = "전체" | EventType;
const eventFilterOptions: EventFilterOption[] = [
  "전체",
  "선착순",
  "추첨접수",
  "추첨발표",
  "미결제/대기예약",
];

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

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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

function getWeekdaysAfterDayInMonth(
  year: number,
  monthIndex: number,
  weekday: number,
  dayThreshold: number
) {
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

function generateDatesFromRule(
  ruleText: string,
  year: number,
  monthIndex: number
): { date: string; time: string }[] {
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

function getOperatorBadgeClass(operatorType: string) {
  if (operatorType === "국립") {
    return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  }
  return "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200";
}

function getEventTypeBadgeClass(eventType: EventType) {
  if (eventType === "선착순") {
    return "bg-sky-50 text-sky-700 ring-1 ring-sky-200";
  }
  if (eventType === "추첨접수") {
    return "bg-amber-50 text-amber-700 ring-1 ring-amber-200";
  }
  if (eventType === "추첨발표") {
    return "bg-violet-50 text-violet-700 ring-1 ring-violet-200";
  }
  if (eventType === "미결제/대기예약") {
    return "bg-rose-50 text-rose-700 ring-1 ring-rose-200";
  }
  return "bg-stone-100 text-stone-700 ring-1 ring-stone-200";
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

function ChipButton({
  active,
  children,
  onClick,
  strong = false,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
  strong?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "shrink-0 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition",
        strong
          ? active
            ? "border-emerald-700 bg-emerald-700 text-white"
            : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
          : active
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-stone-200 bg-white text-stone-600 hover:bg-stone-50"
      )}
    >
      {children}
    </button>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cx(
        "rounded-xl border px-4 py-2 text-sm font-semibold transition",
        active
          ? "border-emerald-700 bg-emerald-700 text-white shadow-sm"
          : "border-stone-200 bg-white text-stone-700 hover:bg-stone-50"
      )}
    >
      {children}
    </button>
  );
}

function Badge({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cx(
        "inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold",
        className
      )}
    >
      {children}
    </span>
  );
}

function SectionCard({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cx("rounded-2xl border border-stone-200 bg-white shadow-sm", className)}>
      {children}
    </div>
  );
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
  const [openFilter, setOpenFilter] = useState<string | null>(null);
  const [isGroupDetailOpen, setIsGroupDetailOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [mobileGroup, setMobileGroup] = useState<EventGroup | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);

  useEffect(() => {
    const current = new Date();
    setTodayKey(formatDateKey(current));
    setIsClient(true);
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 767px)");

    const handleChange = () => {
      setIsMobile(media.matches);
    };

    handleChange();
    media.addEventListener("change", handleChange);

    return () => {
      media.removeEventListener("change", handleChange);
    };
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

      const matchesZone = selectedZone === "전체" || item.zone === selectedZone;

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
    calendarEvents.forEach((e) => {
      map[e.eventDate] = (map[e.eventDate] || 0) + 1;
    });
    return map;
  }, [calendarEvents]);

  const eventTypeCountByDate = useMemo(() => {
    const map: Record<
      string,
      {
        선착순: number;
        추첨접수: number;
        추첨발표: number;
        "미결제/대기예약": number;
      }
    > = {};

    visibleEvents.forEach((e) => {
      if (!map[e.eventDate]) {
        map[e.eventDate] = {
          선착순: 0,
          추첨접수: 0,
          추첨발표: 0,
          "미결제/대기예약": 0,
        };
      }

      map[e.eventDate][e.eventType] += 1;
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
    if (!groupedForSelectedDate.length || !selectedGroupKey) return null;
    return (
      groupedForSelectedDate.find((group) => group.groupKey === selectedGroupKey) || null
    );
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

  function toggleFilter(name: string) {
    setOpenFilter((prev) => (prev === name ? null : name));
  }

  function closeModal() {
    setIsModalOpen(false);
    setSelectedGroupKey(null);
    setIsGroupDetailOpen(false);
    setMobileGroup(null);
  }

  function closeGroupDetail() {
    setIsGroupDetailOpen(false);
    setMobileGroup(null);
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
    <main className="min-h-screen bg-white text-stone-800">
      <div className="mx-auto max-w-7xl px-4 py-4 md:px-6 md:py-8">
        <SectionCard className="overflow-visible">
          <div className="flex flex-col">
            <div className="shrink-0 border-b border-stone-200 px-4 py-5 md:px-6 md:py-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                <div className="space-y-1">
                  <div>
                      <div className="flex items-center gap-2.5">
                        <span style={{ fontSize: "30px" }}>🏕️</span>

                        <h1
                          className="font-extrabold tracking-[-0.5px]"
                          style={{ fontSize: "34px", color: "#2F6F5E" }}
                        >
                          ForestTime
                        </h1>
                      </div>

                    <div className="mt-1 text-sm text-stone-300 md:text-base">
                      자연휴양림 · 국립공원 · 캠핑장
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                {tabOptions.map((tab) => (
                  <TabButton key={tab} active={activeTab === tab} onClick={() => setActiveTab(tab)}>
                    {tab}
                  </TabButton>
                ))}
              </div>
            </div>

            <div className="flex min-h-0 flex-1 flex-col px-4 py-5 md:px-6 md:py-6">
              <div className="shrink-0 min-h-[230px] grid gap-4 rounded-2xl bg-stone-50/40 p-4 md:min-h-[250px] md:p-5">
                <div className="relative">
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="시설명, 지역, 권역, 규칙 검색"
                    className="h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 pr-12 text-sm text-stone-800 outline-none transition placeholder:text-stone-400 focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-100"
                  />
                  <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-stone-400">
                    ⌕
                  </span>
                </div>

                <div className="grid min-w-0 gap-2">
                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleFilter("event")}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="text-sm font-medium text-stone-500">빠른필터</span>
                      <span className="text-sm font-semibold text-emerald-700">
                        {selectedEventFilter === "미결제/대기예약"
                          ? "미결제/대기"
                          : selectedEventFilter}
                        <span className="ml-1 text-stone-400">
                          {openFilter === "event" ? "▲" : "▼"}
                        </span>
                      </span>
                    </button>

                    {openFilter === "event" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {eventFilterOptions.map((type) => (
                          <ChipButton
                            key={type}
                            active={selectedEventFilter === type}
                            onClick={() => {
                              setSelectedEventFilter(type);
                              setSelectedDate(null);
                              setSelectedGroupKey(null);
                              setIsModalOpen(false);
                              setOpenFilter(null);
                            }}
                          >
                            {type === "미결제/대기예약" ? "미결제/대기" : type}
                          </ChipButton>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleFilter("operator")}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="text-sm font-medium text-stone-500">운영주체</span>
                      <span className="text-sm font-semibold text-emerald-700">
                        {selectedOperator}
                        <span className="ml-1 text-stone-400">
                          {openFilter === "operator" ? "▲" : "▼"}
                        </span>
                      </span>
                    </button>

                    {openFilter === "operator" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {operatorOptions.map((type) => (
                          <ChipButton
                            key={type}
                            strong
                            active={selectedOperator === type}
                            onClick={() => {
                              setSelectedOperator(type);
                              setSelectedDate(null);
                              setSelectedGroupKey(null);
                              setIsModalOpen(false);
                              setOpenFilter(null);
                            }}
                          >
                            {type}
                          </ChipButton>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleFilter("facility")}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="text-sm font-medium text-stone-500">시설유형</span>
                      <span className="text-sm font-semibold text-emerald-700">
                        {selectedFacility}
                        <span className="ml-1 text-stone-400">
                          {openFilter === "facility" ? "▲" : "▼"}
                        </span>
                      </span>
                    </button>

                    {openFilter === "facility" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {facilityOptions.map((type) => (
                          <ChipButton
                            key={type}
                            active={selectedFacility === type}
                            onClick={() => {
                              setSelectedFacility(type);
                              setSelectedDate(null);
                              setSelectedGroupKey(null);
                              setIsModalOpen(false);
                              setOpenFilter(null);
                            }}
                          >
                            {type}
                          </ChipButton>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleFilter("zone")}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="text-sm font-medium text-stone-500">권역</span>
                      <span className="text-sm font-semibold text-emerald-700">
                        {selectedZone}
                        <span className="ml-1 text-stone-400">
                          {openFilter === "zone" ? "▲" : "▼"}
                        </span>
                      </span>
                    </button>

                    {openFilter === "zone" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {zoneOptions.map((type) => (
                          <ChipButton
                            key={type}
                            active={selectedZone === type}
                            onClick={() => {
                              setSelectedZone(type);
                              setSelectedDate(null);
                              setSelectedGroupKey(null);
                              setIsModalOpen(false);
                              setOpenFilter(null);
                            }}
                          >
                            {type}
                          </ChipButton>
                        ))}
                      </div>
                    )}
                  </div>


                  <div className="rounded-2xl border border-stone-200 bg-white px-3 py-2">
                    <button
                      type="button"
                      onClick={() => toggleFilter("sort")}
                      className="flex w-full items-center justify-between gap-3 text-left"
                    >
                      <span className="text-sm font-medium text-stone-500">정렬</span>
                      <span className="text-sm font-semibold text-emerald-700">
                        {sortMode}
                        <span className="ml-1 text-stone-400">
                          {openFilter === "sort" ? "▲" : "▼"}
                        </span>
                      </span>
                    </button>

                    {openFilter === "sort" && (
                      <div className="mt-3 flex flex-wrap gap-2">
                        {sortOptions.map((type) => (
                          <ChipButton
                            key={type}
                            active={sortMode === type}
                            onClick={() => {
                              setSortMode(type);
                              setOpenFilter(null);
                            }}
                          >
                            {type}
                          </ChipButton>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {activeTab === "캘린더" && (
                 <div className="mt-6 border-t border-stone-200 pt-6">
                  <div className="mb-5 shrink-0 flex items-center justify-center">
                    <button
                      onClick={() => moveMonth(-1)}
                      className="mr-5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-stone-400 transition-all duration-200 hover:bg-stone-100 hover:text-stone-900"
                      aria-label="이전 달"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M15 18l-6-6 6-6"
                        />
                      </svg>
                    </button>

                    <div className="px-2 text-2xl font-semibold text-stone-900 md:text-3xl">
                      {monthLabel}
                    </div>

                    <button
                      onClick={() => moveMonth(1)}
                      className="ml-5 flex h-10 w-10 cursor-pointer items-center justify-center rounded-full text-stone-400 transition-all duration-200 hover:bg-stone-100 hover:text-stone-900"
                      aria-label="다음 달"
                    >
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.2"
                        className="h-5 w-5"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 6l6 6-6 6"
                        />
                      </svg>
                    </button>
                  </div>

                  <div className="mb-5 shrink-0 flex flex-wrap items-center justify-center gap-2">
                    <span className="inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
                      선착순
                    </span>

                    <span className="inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                      추첨접수
                    </span>

                    <span className="inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">
                      추첨발표
                    </span>

                    <span className="inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                      미결제/대기
                    </span>
                  </div>

                  <div className="mb-2 shrink-0 grid grid-cols-7 gap-1 md:gap-2">
                    {["일", "월", "화", "수", "목", "금", "토"].map((day, i) => (
                      <div
                        key={day}
                        className={cx(
                          "rounded-xl bg-stone-100 px-2 py-2 text-center text-xs font-semibold md:text-sm",
                          i === 0
                            ? "text-rose-500"
                            : i === 6
                            ? "text-blue-600"
                            : "text-stone-600"
                        )}
                      >
                        {day}
                      </div>
                    ))}
                  </div>

                  <div>
                    <div className="grid h-full grid-cols-7 auto-rows-[170px] gap-1 md:auto-rows-fr md:gap-2">
                      {monthMatrix.flat().map((date) => {
                        const inMonth = date.getMonth() === viewMonth;
                        const key = formatDateKey(date);
                        const typeCounts = eventTypeCountByDate[key] || {
                          선착순: 0,
                          추첨접수: 0,
                          추첨발표: 0,
                          "미결제/대기예약": 0,
                        };

                        const isSelected = selectedDate === key;
                        const now = new Date();

                        const isToday =
                          date.getFullYear() === now.getFullYear() &&
                          date.getMonth() === now.getMonth() &&
                          date.getDate() === now.getDate();

                        return (
                          <button
                            key={key}
                            onClick={() => {
                              if (!inMonth) return;
                              openDateModal(key);
                            }}
                            className={cx(
                              "group relative flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border px-3 py-3 text-left transition-all duration-200 md:h-full md:px-4 md:py-4",
                              inMonth
                                ? "border-stone-200 bg-white hover:-translate-y-[1px] hover:border-stone-300 hover:bg-stone-50/80 hover:shadow-sm"
                                : "cursor-default border-stone-100 bg-stone-50/50 text-stone-300",
                              isToday && "border-emerald-400",
                              isSelected && "border-emerald-500 shadow-[0_0_0_1px_rgba(16,185,129,0.15)]"
                            )}
                          >
                            <div className="flex h-full w-full flex-col">
                              <div className="flex w-full items-start justify-start">
                                <div className="flex h-[30px] w-[30px] items-center justify-center">
                                  <div
                                    className={cx(
                                      "flex h-[30px] w-[30px] items-center justify-center rounded-full text-sm font-bold leading-none md:text-base",
                                      isToday
                                        ? "bg-emerald-600 text-white"
                                        : inMonth
                                        ? "text-stone-900"
                                        : "text-stone-300",
                                      !isToday && isSelected && inMonth && "text-emerald-700"
                                    )}
                                  >
                                    {date.getDate()}
                                  </div>
                                </div>
                              </div>

                              <div className="mt-auto flex w-full flex-col gap-1 pt-1.5 md:gap-1.5 md:pt-2">
                                <div className="flex h-[17px] w-full items-center justify-center md:h-[20px]">
                                  <span
                                    style={{ visibility: typeCounts.선착순 === 0 ? "hidden" : "visible" }}
                                    className="flex w-full max-w-[108px] items-center justify-center rounded-full bg-sky-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-sky-700 md:h-[20px] md:text-[11px]"
                                  >
                                    {typeCounts.선착순}
                                  </span>
                                </div>

                                <div className="flex h-[17px] w-full items-center justify-center md:h-[20px]">
                                  <span
                                    style={{ visibility: typeCounts.추첨접수 === 0 ? "hidden" : "visible" }}
                                    className="flex w-full max-w-[108px] items-center justify-center rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-amber-700 md:h-[20px] md:text-[11px]"
                                  >
                                    {typeCounts.추첨접수}
                                  </span>
                                </div>

                                <div className="flex h-[17px] w-full items-center justify-center md:h-[20px]">
                                  <span
                                    style={{ visibility: typeCounts.추첨발표 === 0 ? "hidden" : "visible" }}
                                    className="flex w-full max-w-[108px] items-center justify-center rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-violet-700 md:h-[20px] md:text-[11px]"
                                  >
                                    {typeCounts.추첨발표}
                                  </span>
                                </div>

                                <div className="flex h-[17px] w-full items-center justify-center md:h-[20px]">
                                  <span
                                    style={{
                                      visibility:
                                        typeCounts["미결제/대기예약"] === 0 ? "hidden" : "visible",
                                    }}
                                    className="flex w-full max-w-[108px] items-center justify-center rounded-full bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium leading-none text-rose-700 md:h-[20px] md:text-[11px]"
                                  >
                                    {typeCounts["미결제/대기예약"]}
                                  </span>
                                </div>
                              </div>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "타임라인" && (
                <div className="mt-6 border-t border-stone-200 pt-6">
                  <div className="mb-5 flex items-center justify-center gap-3">
                    <button
                      onClick={() => moveMonth(-1)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-lg text-stone-700 transition hover:bg-stone-50"
                      aria-label="이전 달"
                    >
                      ‹
                    </button>

                    <div className="text-xl font-semibold tracking-tight text-stone-900 md:text-3xl">
                      {monthLabel}
                    </div>

                    <button
                      onClick={() => moveMonth(1)}
                      className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-200 bg-white text-lg text-stone-700 transition hover:bg-stone-50"
                      aria-label="다음 달"
                    >
                      ›
                    </button>
                  </div>

                  {timelineGroups.length ? (
                    <div className="grid gap-4">
                      {timelineGroups.map((dateGroup) => (
                        <SectionCard
                          key={dateGroup.date}
                          className="cursor-pointer bg-white/60 p-4 transition hover:shadow-md"
                        >
                          <button
                            onClick={() => openDateModal(dateGroup.date)}
                            className="w-full text-left"
                          >
                            <div className="mb-4 flex items-center justify-between gap-3">
                              <div className="text-lg font-semibold text-stone-900 md:text-xl">
                                {getDateLabel(dateGroup.date)}
                              </div>
                              <div className="text-sm font-semibold text-stone-400">›</div>
                            </div>

                            <div className="grid gap-3">
                              {dateGroup.groups.map((group) => (
                                <div
                                  key={group.groupKey}
                                  className="rounded-2xl border border-stone-200 bg-white p-4"
                                >
                                  <div className="mb-2 flex flex-wrap gap-2">
                                    <Badge className="bg-emerald-700 text-white">
                                      {group.eventTime}
                                    </Badge>
                                    <Badge className={getOperatorBadgeClass(group.operatorType)}>
                                      {group.operatorType}
                                    </Badge>
                                    <Badge className={getEventTypeBadgeClass(group.eventType)}>
                                      {getEventTypeLabel(group.eventType)}
                                    </Badge>
                                  </div>

                                  <div className="mb-1 text-sm font-semibold text-stone-900 md:text-base">
                                    {group.items.length}개 시설
                                  </div>
                                  <div className="text-xs text-stone-500 md:text-sm">
                                    {summarizeZones(group.items)}
                                  </div>
                                </div>
                              ))}
                            </div>
                          </button>
                        </SectionCard>
                      ))}
                    </div>
                  ) : (
                    <SectionCard className="border-dashed p-10 text-center text-sm text-stone-500">
                      이번 달에는 표시할 일정이 없습니다.
                    </SectionCard>
                  )}
                </div>
              )}

              {activeTab === "숙소검색" && (
                <div className="mt-6 flex min-h-0 flex-1 flex-col border-t border-stone-200 pt-6">
                  <div className="mb-4 shrink-0 text-sm text-stone-500">
                    검색어와 필터에 맞는 숙소를 시설 중심으로 확인할 수 있습니다.
                  </div>

                  {searchableItems.length ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {searchableItems.map((item) => (
                        <SectionCard key={item.id} className="h-full w-full p-4">
                          <div className="flex h-full flex-col rounded-2xl border border-stone-200 bg-stone-50/70 p-5">
                            <div className="mb-3 flex flex-wrap gap-2">
                              <Badge className="bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                                {item.zone}
                              </Badge>
                              <Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                {item.region}
                              </Badge>
                            </div>

                            <div className="mb-2 text-xl font-semibold text-stone-900">
                              {item.name}
                            </div>

                            <div className="mb-3 text-sm text-stone-600">
                              {item.facilityType} · {item.operatorType}
                            </div>

                            {item.firstComeRule ? (
                              <div className="mb-2.5 text-sm font-semibold leading-7 text-sky-700">
                                <span className="mr-2 inline-flex rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-bold text-sky-700 ring-1 ring-sky-200">
                                  선착순
                                </span>
                                {item.firstComeRule}
                              </div>
                            ) : null}

                            {item.lotteryRule ? (
                              <div className="mb-2.5 text-sm font-semibold leading-7 text-amber-700">
                                <span className="mr-2 inline-flex rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-bold text-amber-700 ring-1 ring-amber-200">
                                  추첨접수
                                </span>
                                {item.lotteryRule}
                              </div>
                            ) : null}

                            {item.lotteryResult ? (
                              <div className="mb-2.5 text-sm font-semibold leading-7 text-violet-700">
                                <span className="mr-2 inline-flex rounded-full bg-violet-50 px-2 py-0.5 text-[11px] font-bold text-violet-700 ring-1 ring-violet-200">
                                  추첨발표
                                </span>
                                {item.lotteryResult}
                              </div>
                            ) : null}

                            {item.waitingOpen ? (
                              <div className="mb-2.5 text-sm font-semibold leading-7 text-rose-700">
                                <span className="mr-2 inline-flex rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700 ring-1 ring-rose-200">
                                  미결제/대기
                                </span>
                                {item.waitingOpen}
                              </div>
                            ) : null}

                            {item.lotteryTarget ? (
                              <div className="mb-2 text-sm leading-6 text-stone-500">
                                추첨대상 · {item.lotteryTarget}
                              </div>
                            ) : null}

                            {item.note ? (
                              <div className="mb-3 text-sm leading-6 text-stone-500">
                                비고 · {item.note}
                              </div>
                            ) : null}

                            {item.localPriorityPolicy ? (
                              <div className="mb-3">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(`${item.id}_policy_search`)}
                                  className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                                >
                                  📌 우선예약 {expandedItems[`${item.id}_policy_search`] ? "▲ 접기" : "▼ 더보기"}
                                </button>

                                {expandedItems[`${item.id}_policy_search`] ? (
                                  <div className="mt-2 whitespace-pre-line text-sm leading-6 text-rose-600">
                                    {item.localPriorityPolicy}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {item.recommendedRoomMemo ? (
                              <div className="mb-3">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(`${item.id}_recommended_search`)}
                                  className="text-sm font-semibold text-sky-600 hover:text-sky-700"
                                >
                                  ⭐ 추천객실 {expandedItems[`${item.id}_recommended_search`] ? "▲ 접기" : "▼ 더보기"}
                                </button>

                                {expandedItems[`${item.id}_recommended_search`] ? (
                                  <div className="mt-2 whitespace-pre-line text-sm leading-6 text-sky-700">
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
                                className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                              >
                                홈페이지 바로가기 →
                              </a>
                            ) : null}
                          </div>
                        </SectionCard>
                      ))}
                    </div>
                  ) : (
                    <SectionCard className="border-dashed p-10 text-center text-sm text-stone-500">
                      조건에 맞는 숙소가 없습니다.
                    </SectionCard>
                  )}
                </div>
              )}
            </div>
          </div>
        </SectionCard>

        {isModalOpen && selectedDate && (
          <div
            onClick={closeModal}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          >
            <div
              onClick={(e) => e.stopPropagation()}
              className="grid h-[90vh] w-full max-w-7xl overflow-hidden rounded-3xl bg-white shadow-2xl md:grid-cols-[320px_1fr]"
            >
              <section
  className="date-modal-scroll overflow-y-auto border-b border-stone-200 p-4 md:border-b-0 md:border-r md:p-5"
  onScroll={(e) => {
    setShowScrollTop(e.currentTarget.scrollTop > 40);
  }}
>
                <div className="mb-4 flex items-start justify-between gap-3">
                  <div>
                    <div className="mb-1 text-xl font-semibold text-stone-900 md:text-2xl">
                      {selectedDateLabel}
                    </div>
                    <div className="text-sm text-stone-500">
                      {eventsForSelectedDate.length}개 일정
                    </div>
                  </div>

                  <button
                    onClick={closeModal}
                    className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xl font-semibold text-stone-600 transition hover:bg-stone-200"
                    aria-label="닫기"
                  >
                    ×
                  </button>
                </div>

{groupedForSelectedDate.length > 0 ? (
  <div className="grid gap-3">
    {groupedForSelectedDate.map((group) => {
      const active = currentGroup?.groupKey === group.groupKey;
      return (
        <button
          key={group.groupKey}
          onClick={() => {
            if (isMobile) {
              setMobileGroup(group);
              setIsGroupDetailOpen(true);
              return;
            }

            setSelectedGroupKey(group.groupKey);
          }}
          className={cx(
            "w-full rounded-2xl border p-4 text-left transition",
            active
              ? "border-emerald-500 bg-emerald-50 ring-2 ring-emerald-100"
              : "border-stone-200 bg-white hover:shadow-sm"
          )}
        >
          <div className="mb-2 flex flex-wrap gap-2">
            <Badge className="bg-emerald-700 text-white">{group.eventTime}</Badge>
            <Badge className={getOperatorBadgeClass(group.operatorType)}>
              {group.operatorType}
            </Badge>
            <Badge className={getEventTypeBadgeClass(group.eventType)}>
              {getEventTypeLabel(group.eventType)}
            </Badge>
          </div>

          <div className="mb-1 text-sm font-semibold text-stone-900 md:text-base">
            {group.items.length}개 시설
          </div>
          <div className="text-xs text-stone-500 md:text-sm">
            {summarizeZones(group.items)}
          </div>
        </button>
      );
    })}
  </div>
) : (
  <div className="rounded-2xl border border-dashed border-stone-300 bg-stone-50 py-10 text-center text-sm text-stone-500">
    선택된 날짜에 해당하는 일정이 없습니다.
  </div>
)}
              </section>

              {showScrollTop && (
                <button
                  onClick={() => {
                    const el = document.querySelector(".date-modal-scroll");
                    if (el) {
                      el.scrollTo({ top: 0, behavior: "smooth" });
                    }
                  }}
                  className="fixed bottom-20 right-5 z-[70] flex h-12 w-12 items-center justify-center rounded-full bg-emerald-600 text-white shadow-lg transition hover:scale-105 hover:bg-emerald-700 md:bottom-6 md:right-6"
                  aria-label="맨 위로 이동"
                >
                  ↑
                </button>
              )}

              <section className="hidden overflow-y-auto bg-white/70 p-4 md:block md:p-5">
                {currentGroup ? (
                  <SectionCard className="p-4 md:p-5">
                    <div className="mb-5">
                      <div className="mb-3 flex flex-wrap gap-2">
                        <Badge className="bg-emerald-700 text-white">
                          {currentGroup.eventTime}
                        </Badge>
                        <Badge className={getOperatorBadgeClass(currentGroup.operatorType)}>
                          {currentGroup.operatorType}
                        </Badge>
                        <Badge className={getEventTypeBadgeClass(currentGroup.eventType)}>
                          {getEventTypeLabel(currentGroup.eventType)}
                        </Badge>
                      </div>

                      <h2 className="text-2xl font-semibold tracking-tight text-stone-900 md:text-3xl">
                        {currentGroup.operatorType} · {getEventTypeLabel(currentGroup.eventType)} ·{" "}
                        {currentGroup.eventTime}
                      </h2>

                      <div className="mt-2 text-sm text-stone-500 md:text-base">
                        {currentGroup.items.length}개 시설 · {summarizeZones(currentGroup.items)}
                      </div>
                    </div>

                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {currentGroup.items.map((item) => {
                        const policyKey = `${item.id}_${item.eventDate}_${item.eventType}_policy`;
                        const recommendedKey = `${item.id}_${item.eventDate}_${item.eventType}_recommended`;

                        return (
                          <div
                            key={`${item.id}_${item.eventDate}_${item.eventType}`}
                            className="rounded-2xl border border-stone-200 bg-white/70 p-4"
                          >
                            <div className="mb-3 flex flex-wrap gap-2">
                              <Badge className="bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                                {item.zone}
                              </Badge>
                              <Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                                {item.region}
                              </Badge>
                            </div>

                            <div className="mb-2 text-lg font-semibold text-stone-900">
                              {item.name}
                            </div>

                            <div className="mb-3 text-sm text-stone-600">
                              {item.facilityType} · {item.operatorType}
                            </div>

                            {item.eventType === "선착순" && item.firstComeRule ? (
                              <div className="mb-2 text-sm font-semibold leading-6 text-sky-700">
                                {item.firstComeRule}
                              </div>
                            ) : null}

                            {item.eventType === "추첨접수" && item.lotteryRule ? (
                              <div className="mb-2 text-sm font-semibold leading-6 text-amber-700">
                                {item.lotteryRule}
                              </div>
                            ) : null}

                            {item.eventType === "추첨발표" && item.lotteryResult ? (
                              <div className="mb-2 text-sm font-semibold leading-6 text-violet-700">
                                {item.lotteryResult}
                              </div>
                            ) : null}

                            {item.eventType === "미결제/대기예약" && item.waitingOpen ? (
                              <div className="mb-2 text-sm font-semibold leading-6 text-rose-700">
                                {item.waitingOpen}
                              </div>
                            ) : null}

                            {item.lotteryTarget ? (
                              <div className="mb-2 text-sm leading-6 text-stone-500">
                                추첨대상 · {item.lotteryTarget}
                              </div>
                            ) : null}

                            {item.note ? (
                              <div className="mb-3 text-sm leading-6 text-stone-500">
                                비고 · {item.note}
                              </div>
                            ) : null}

                            {item.localPriorityPolicy ? (
                              <div className="mb-3">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(policyKey)}
                                  className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                                >
                                  📌 우선예약 {expandedItems[policyKey] ? "▲ 접기" : "▼ 더보기"}
                                </button>

                                {expandedItems[policyKey] ? (
                                  <div className="mt-2 whitespace-pre-line text-sm leading-6 text-rose-600">
                                    {item.localPriorityPolicy}
                                  </div>
                                ) : null}
                              </div>
                            ) : null}

                            {item.recommendedRoomMemo ? (
                              <div className="mb-3">
                                <button
                                  type="button"
                                  onClick={() => toggleExpand(recommendedKey)}
                                  className="text-sm font-semibold text-sky-600 hover:text-sky-700"
                                >
                                  ⭐ 추천객실 {expandedItems[recommendedKey] ? "▲ 접기" : "▼ 더보기"}
                                </button>

                                {expandedItems[recommendedKey] ? (
                                  <div className="mt-2 whitespace-pre-line text-sm leading-6 text-sky-700">
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
                                className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                              >
                                홈페이지 바로가기 →
                              </a>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  </SectionCard>
                ) : (
                  !isMobile && (
                    <div className="flex h-full items-center justify-center text-sm text-stone-400">
                      좌측에서 항목을 선택하세요
                    </div>
                  )
                )}
              </section>

              {isGroupDetailOpen && mobileGroup && (
                <div
                  onClick={() => setIsGroupDetailOpen(false)}
                  className="fixed inset-0 z-[60] flex items-end bg-black/40 md:hidden"
                >
                  <div
                    onClick={(e) => e.stopPropagation()}
                    className="flex max-h-[85vh] w-full flex-col rounded-t-3xl bg-white shadow-2xl"
                  >
                    <div className="shrink-0 flex items-start justify-between gap-3 rounded-t-3xl border-b border-stone-200 bg-white px-4 py-4">
                      <div>
                        <div className="mb-2 flex flex-wrap gap-2">
                          <Badge className="bg-emerald-700 text-white">
                            {mobileGroup.eventTime}
                          </Badge>
                          <Badge className={getOperatorBadgeClass(mobileGroup.operatorType)}>
                            {mobileGroup.operatorType}
                          </Badge>
                          <Badge className={getEventTypeBadgeClass(mobileGroup.eventType)}>
                            {getEventTypeLabel(mobileGroup.eventType)}
                          </Badge>
                        </div>

                        <h3 className="text-xl font-semibold text-stone-900">
                          {mobileGroup.operatorType} · {getEventTypeLabel(mobileGroup.eventType)} ·{" "}
                          {mobileGroup.eventTime}
                        </h3>

                        <div className="mt-1 text-sm text-stone-500">
                          {mobileGroup.items.length}개 시설 · {summarizeZones(mobileGroup.items)}
                        </div>
                      </div>

                      <button
                        onClick={closeGroupDetail}
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-stone-100 text-xl font-semibold text-stone-600"
                        aria-label="닫기"
                      >
                        ×
                      </button>
                    </div>

                    <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 pt-4">
                      <div className="grid gap-4">
                      {mobileGroup.items.map((item) => (
                        <div
                          key={`${item.id}_${item.eventDate}_${item.eventType}_mobile`}
                          className="rounded-2xl border border-stone-200 bg-white p-4"
                        >
                          <div className="mb-3 flex flex-wrap gap-2">
                            <Badge className="bg-sky-50 text-sky-700 ring-1 ring-sky-200">
                              {item.zone}
                            </Badge>
                            <Badge className="bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200">
                              {item.region}
                            </Badge>
                          </div>

                          <div className="mb-2 text-lg font-semibold text-stone-900">
                            {item.name}
                          </div>

                          <div className="mb-3 text-sm text-stone-600">
                            {item.facilityType} · {item.operatorType}
                          </div>

                          {item.eventType === "선착순" && item.firstComeRule ? (
                            <div className="mb-2 text-sm font-semibold leading-6 text-sky-700">
                              {item.firstComeRule}
                            </div>
                          ) : null}

                          {item.eventType === "추첨접수" && item.lotteryRule ? (
                            <div className="mb-2 text-sm font-semibold leading-6 text-amber-700">
                              {item.lotteryRule}
                            </div>
                          ) : null}

                          {item.eventType === "추첨발표" && item.lotteryResult ? (
                            <div className="mb-2 text-sm font-semibold leading-6 text-violet-700">
                              {item.lotteryResult}
                            </div>
                          ) : null}

                          {item.eventType === "미결제/대기예약" && item.waitingOpen ? (
                            <div className="mb-2 text-sm font-semibold leading-6 text-rose-700">
                              {item.waitingOpen}
                            </div>
                          ) : null}

                          {item.lotteryTarget ? (
                            <div className="mb-2 text-sm leading-6 text-stone-500">
                              추첨대상 · {item.lotteryTarget}
                            </div>
                          ) : null}

                          {item.note ? (
                            <div className="mb-3 text-sm leading-6 text-stone-500">
                              비고 · {item.note}
                            </div>
                          ) : null}

                          {/* 🔥 우선예약 추가 */}
                          {item.localPriorityPolicy ? (
                            <div className="mb-3">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleExpand(
                                    `${item.id}_${item.eventDate}_${item.eventType}_policy_mobile`
                                  )
                                }
                                className="text-sm font-semibold text-rose-600 hover:text-rose-700"
                              >
                                📌 우선예약{" "}
                                {expandedItems[
                                  `${item.id}_${item.eventDate}_${item.eventType}_policy_mobile`
                                ]
                                  ? "▲ 접기"
                                  : "▼ 더보기"}
                              </button>

                              {expandedItems[
                                `${item.id}_${item.eventDate}_${item.eventType}_policy_mobile`
                              ] ? (
                                <div className="mt-2 whitespace-pre-line text-sm leading-6 text-rose-600">
                                  {item.localPriorityPolicy}
                                </div>
                              ) : null}
                            </div>
                          ) : null}

                          {/* 🔥 추천객실 (이미 추가됨) */}
                          {item.recommendedRoomMemo ? (
                            <div className="mb-3">
                              <button
                                type="button"
                                onClick={() =>
                                  toggleExpand(
                                    `${item.id}_${item.eventDate}_${item.eventType}_recommended_mobile`
                                  )
                                }
                                className="text-sm font-semibold text-sky-600 hover:text-sky-700"
                              >
                                ⭐ 추천객실{" "}
                                {expandedItems[
                                  `${item.id}_${item.eventDate}_${item.eventType}_recommended_mobile`
                                ]
                                  ? "▲ 접기"
                                  : "▼ 더보기"}
                              </button>

                              {expandedItems[
                                `${item.id}_${item.eventDate}_${item.eventType}_recommended_mobile`
                              ] ? (
                                <div className="mt-2 whitespace-pre-line text-sm leading-6 text-sky-700">
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
                              className="text-sm font-semibold text-emerald-700 hover:text-emerald-800"
                            >
                              홈페이지 바로가기 →
                            </a>
                          ) : null}
                        </div>
                      ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}