# -*- coding: utf-8 -*-
"""
ForestTime 개인 텔레그램 알림 스크립트

사용법 예시:
  python foresttime_telegram_alert.py --mode tomorrow
  python foresttime_telegram_alert.py --mode today
  python foresttime_telegram_alert.py --date 2026-05-15
  python foresttime_telegram_alert.py --mode tomorrow --dry-run

준비:
  1) TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID 입력
  2) DATA_FILE 경로를 본인 PC의 forest_data_app_v4.json 위치로 수정
"""

import argparse
import json
import re
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from pathlib import Path
from urllib.parse import urlencode
from urllib.request import Request, urlopen


# =========================
# 1. 개인 설정
# =========================

TELEGRAM_BOT_TOKEN = "8496248229:AAHR2JOlTfSEFj1ffxtk1I_FuKHk8fwKD0s"
TELEGRAM_CHAT_ID = "5010390695"

# forest-app 프로젝트 기준 예시:
# DATA_FILE = r"C:\Users\사용자명\...\forest-app\app\forest_data_app_v4.json"
# 또는 data/forest.json을 실제로 쓰고 있다면 그 경로로 바꾸면 됩니다.
DATA_FILE = r"app\forest_data_app_v4.json"

# 관심 휴양림만 받고 싶으면 이름 일부를 넣으세요.
# 비워두면 전체 알림.
WATCH_NAMES = [
    # "월아산",
    # "하동편백",
    # "산청",
    # "원산도",
]

# 관심 권역만 받고 싶으면 사용.
WATCH_ZONES = [
    # "부산/경남",
    # "대구/경북",
]

# 관심 운영주체만 받고 싶으면 사용. 예: ["국립"], ["공립"]
WATCH_OPERATORS = [
    # "국립",
]

# 관심 이벤트만 받고 싶으면 사용.
# 가능한 값: "선착순", "추첨접수", "추첨발표", "미결제/대기예약"
WATCH_EVENT_TYPES = [
    # "선착순",
    # "미결제/대기예약",
]

# 너무 긴 알림 방지용
MAX_ITEMS_PER_GROUP = 999


# =========================
# 2. 날짜/규칙 파서
# =========================

WEEKDAY_MAP = {"일": 6, "월": 0, "화": 1, "수": 2, "목": 3, "금": 4, "토": 5}
EVENT_ORDER = {"선착순": 0, "추첨접수": 1, "추첨발표": 2, "미결제/대기예약": 3}
OPERATOR_ORDER = {"국립": 0, "공립": 1}


def normalize_rule_text(text: str) -> str:
    return (
        (text or "")
        .replace("잔여사이트", "")
        .replace("선착순", "")
        .replace("추첨", "")
        .strip()
    )


def pad2(n: int) -> str:
    return str(n).zfill(2)


def parse_time(text: str) -> str:
    normalized = normalize_rule_text(text)

    m = re.search(r"(\d{1,2}):(\d{2})", normalized)
    if m:
        hour = int(m.group(1))
        minute = int(m.group(2))
        if hour == 24:
            hour = 23
            minute = 59
        return f"{pad2(hour)}:{pad2(minute)}"

    m = re.search(r"(\d{1,2})시", normalized)
    if m:
        hour = int(m.group(1))
        if hour == 24:
            return "23:59"
        return f"{pad2(hour)}:00"

    return "09:00"


def month_days(year: int, month: int) -> int:
    if month == 12:
        next_month = date(year + 1, 1, 1)
    else:
        next_month = date(year, month + 1, 1)
    return (next_month - date(year, month, 1)).days


def safe_date(year: int, month: int, day: int):
    try:
        return date(year, month, day)
    except ValueError:
        return None


def get_all_weekdays_in_month(year: int, month: int, weekday: int):
    result = []
    d = date(year, month, 1)
    while d.month == month:
        if d.weekday() == weekday:
            result.append(d)
        d += timedelta(days=1)
    return result


def first_weekday_of_month(year: int, month: int):
    d = date(year, month, 1)
    while d.weekday() >= 5:
        d += timedelta(days=1)
    return d


def parse_period_from_text(rule_text: str, year: int, month: int):
    normalized = normalize_rule_text(rule_text)

    # 예: 매 짝수월 1일 14시 ~ 5일 16시
    m = re.search(
        r"매\s*(짝수월|홀수월)\s*(\d{1,2})일\s*(\d{1,2})(?::(\d{2}))?시\s*~\s*(\d{1,2})일\s*(\d{1,2})(?::(\d{2}))?시",
        normalized,
    )
    if m:
        month_type = m.group(1)
        if (month_type == "짝수월" and month % 2 != 0) or (month_type == "홀수월" and month % 2 == 0):
            return None

        start_day = int(m.group(2))
        start_hour = int(m.group(3))
        start_min = int(m.group(4) or 0)
        end_day = int(m.group(5))
        end_hour = int(m.group(6))
        end_min = int(m.group(7) or 0)

        start = safe_date(year, month, start_day)
        end = safe_date(year, month, end_day)
        if not start or not end:
            return None

        if end_hour == 24:
            end_hour, end_min = 23, 59

        return {
            "start": start,
            "end": end,
            "time": f"{pad2(start_hour)}:{pad2(start_min)}",
        }

    # 예: 매월 04일 09시 ~ 09일 18시
    m = re.search(
        r"매월\s*(\d{1,2})일\s*(\d{1,2})(?::(\d{2}))?시\s*~\s*(\d{1,2})일\s*(\d{1,2})(?::(\d{2}))?시",
        normalized,
    )
    if m:
        start_day = int(m.group(1))
        start_hour = int(m.group(2))
        start_min = int(m.group(3) or 0)
        end_day = int(m.group(4))
        end_hour = int(m.group(5))
        end_min = int(m.group(6) or 0)

        start = safe_date(year, month, start_day)
        end = safe_date(year, month, end_day)
        if not start or not end:
            return None

        if end_hour == 24:
            end_hour, end_min = 23, 59

        return {
            "start": start,
            "end": end,
            "time": f"{pad2(start_hour)}:{pad2(start_min)}",
        }

    # 예: 7/15 ~ 8/24
    m = re.search(r"(\d{1,2})/(\d{1,2})\s*~\s*(\d{1,2})/(\d{1,2})", normalized)
    if m:
        sm, sd, em, ed = map(int, m.groups())
        start = safe_date(year, sm, sd)
        end = safe_date(year, em, ed)
        if start and end and (start.month == month or end.month == month):
            return {"start": start, "end": end, "time": parse_time(normalized)}

    return None


def generate_dates_from_rule(rule_text: str, year: int, month: int):
    normalized = normalize_rule_text(rule_text)
    time_text = parse_time(normalized)

    # 매 짝수월/홀수월 N일
    m = re.search(r"매\s*(짝수월|홀수월)\s*(\d{1,2})일", normalized)
    if m:
        month_type = m.group(1)
        day = int(m.group(2))
        if (month_type == "짝수월" and month % 2 != 0) or (month_type == "홀수월" and month % 2 == 0):
            return []
        d = safe_date(year, month, day)
        return [{"date": d, "time": time_text}] if d else []

    if "매월 첫번째 평일" in normalized:
        return [{"date": first_weekday_of_month(year, month), "time": time_text}]

    # 매주 수요일
    m = re.search(r"매주\s*([일월화수목금토])요일?", normalized)
    if m:
        weekday = WEEKDAY_MAP[m.group(1)]
        return [{"date": d, "time": time_text} for d in get_all_weekdays_in_month(year, month, weekday)]

    # 매월 15일
    m = re.search(r"매월\s*(\d{1,2})일", normalized)
    if m:
        d = safe_date(year, month, int(m.group(1)))
        return [{"date": d, "time": time_text}] if d else []

    return []


def build_events_for_item(item: dict, year: int, month: int):
    events = []

    def add_event(event_type, event_date, event_time, period_start=None, period_end=None):
        events.append({
            **item,
            "eventType": event_type,
            "eventDate": event_date.isoformat(),
            "eventTime": event_time,
            "periodStartDate": period_start.isoformat() if period_start else "",
            "periodEndDate": period_end.isoformat() if period_end else "",
        })

    if item.get("firstComeRule"):
        for g in generate_dates_from_rule(item["firstComeRule"], year, month):
            add_event("선착순", g["date"], g["time"])

    if item.get("lotteryRule"):
        period = parse_period_from_text(item["lotteryRule"], year, month)
        if period:
            d = period["start"]
            while d <= period["end"]:
                if d.month == month:
                    add_event("추첨접수", d, period["time"], period["start"], period["end"])
                d += timedelta(days=1)
        else:
            for g in generate_dates_from_rule(item["lotteryRule"], year, month):
                add_event("추첨접수", g["date"], g["time"])

    if item.get("lotteryResult"):
        for g in generate_dates_from_rule(item["lotteryResult"], year, month):
            add_event("추첨발표", g["date"], g["time"])

    if item.get("waitingOpen"):
        for g in generate_dates_from_rule(item["waitingOpen"], year, month):
            add_event("미결제/대기예약", g["date"], g["time"])

        # ForestTime 페이지 로직 반영:
        # 국립 자연휴양림 + 매월 15일 + 6주차 → 15일 이후 수요일에도 미결제/대기 표시
        should_add_rolling_wednesday = (
            item.get("operatorType") == "국립"
            and item.get("facilityType") == "자연휴양림"
            and "매월 15일" in item.get("waitingOpen", "")
            and "6주차" in item.get("note", "")
        )

        if should_add_rolling_wednesday:
            for d in get_all_weekdays_in_month(year, month, WEEKDAY_MAP["수"]):
                if d.day <= 15:
                    continue
                already = any(
                    e["eventType"] == "미결제/대기예약"
                    and e["eventDate"] == d.isoformat()
                    and e.get("name") == item.get("name")
                    for e in events
                )
                if not already:
                    add_event("미결제/대기예약", d, "09:00")

    return events


# =========================
# 3. 필터/메시지/텔레그램
# =========================

def load_data():
    path = Path(DATA_FILE)
    if not path.exists():
        print(f"❌ DATA_FILE을 찾을 수 없습니다: {path.resolve()}")
        print("   DATA_FILE 경로를 forest_data_app_v4.json 실제 위치로 수정하세요.")
        sys.exit(1)

    with path.open("r", encoding="utf-8") as f:
        return json.load(f)


def make_events_for_months(items, target_date: date):
    months = {(target_date.year, target_date.month)}

    # 월말/월초 경계 대비
    prev = target_date - timedelta(days=7)
    nxt = target_date + timedelta(days=7)
    months.add((prev.year, prev.month))
    months.add((nxt.year, nxt.month))

    events = []
    for year, month in sorted(months):
        for item in items:
            events.extend(build_events_for_item(item, year, month))

    # 중복 제거
    seen = set()
    unique = []
    for e in events:
        key = (e.get("id"), e["eventType"], e["eventDate"], e["eventTime"])
        if key not in seen:
            seen.add(key)
            unique.append(e)
    return unique


def contains_any(value: str, keywords):
    if not keywords:
        return True
    value = value or ""
    return any(k in value for k in keywords)


def pass_watch_filters(e):
    if WATCH_NAMES and not contains_any(e.get("name", ""), WATCH_NAMES):
        return False
    if WATCH_ZONES and e.get("zone") not in WATCH_ZONES:
        return False
    if WATCH_OPERATORS and e.get("operatorType") not in WATCH_OPERATORS:
        return False
    if WATCH_EVENT_TYPES and e.get("eventType") not in WATCH_EVENT_TYPES:
        return False
    return True


def weekday_ko(d: date):
    return ["월", "화", "수", "목", "금", "토", "일"][d.weekday()]


def format_message(target_date: date, events):
    title_date = f"{target_date.month}월 {target_date.day}일 ({weekday_ko(target_date)})"
    if not events:
        return f"🌲 ForestTime 알림\n\n📅 {title_date}\n\n오늘 조건에 맞는 예약 오픈 일정이 없습니다."

    grouped = defaultdict(list)
    for e in events:
        grouped[(e["eventTime"], e["operatorType"], e["eventType"])].append(e)

    lines = [
        "🌲 ForestTime 예약 오픈 알림",
        "",
        f"📅 {title_date}",
        f"총 {len(events)}건",
        "",
    ]

    for (event_time, operator, event_type) in sorted(
        grouped.keys(),
        key=lambda k: (k[0], OPERATOR_ORDER.get(k[1], 9), EVENT_ORDER.get(k[2], 9))
    ):
        items = sorted(grouped[(event_time, operator, event_type)], key=lambda x: (x.get("zone", ""), x.get("name", "")))
        lines.append(f"⏰ {event_time} · {operator} · {event_type} ({len(items)}건)")

        shown = items[:MAX_ITEMS_PER_GROUP]
        for item in shown:
            extra = []
            if item.get("region"):
                extra.append(item["region"])
            if item.get("note"):
                extra.append(item["note"])
            suffix = f" / {' · '.join(extra)}" if extra else ""
            lines.append(f"- {item.get('name', '')}{suffix}")

        if len(items) > MAX_ITEMS_PER_GROUP:
            lines.append(f"- 외 {len(items) - MAX_ITEMS_PER_GROUP}건")

        lines.append("")

    return "\n".join(lines).strip()


def send_telegram(message: str):
    if "여기에_" in TELEGRAM_BOT_TOKEN or "여기에_" in TELEGRAM_CHAT_ID:
        print("❌ TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID를 먼저 입력하세요.")
        sys.exit(1)

    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/sendMessage"
    payload = urlencode({
        "chat_id": TELEGRAM_CHAT_ID,
        "text": message,
        "disable_web_page_preview": "true",
    }).encode("utf-8")

    req = Request(url, data=payload, method="POST")
    with urlopen(req, timeout=15) as res:
        body = res.read().decode("utf-8", errors="replace")
        if res.status != 200:
            raise RuntimeError(body)
        return body


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--mode", choices=["today", "tomorrow", "hour-before"], default="tomorrow")
    parser.add_argument("--date", help="특정 날짜 YYYY-MM-DD. 입력하면 --mode보다 우선합니다.")
    parser.add_argument("--dry-run", action="store_true", help="텔레그램 발송 없이 콘솔 출력만 합니다.")
    args = parser.parse_args()

    target_time = None

    if args.date:
        target_date = datetime.strptime(args.date, "%Y-%m-%d").date()
    elif args.mode == "today":
        target_date = date.today()
    elif args.mode == "hour-before":
        target_dt = datetime.now() + timedelta(hours=1)
        target_date = target_dt.date()
        target_time = f"{target_dt.hour:02d}:00"
    else:
        target_date = date.today() + timedelta(days=1)

    items = load_data()
    all_events = make_events_for_months(items, target_date)

    target_events = [
        e for e in all_events
        if e["eventDate"] == target_date.isoformat()
        and pass_watch_filters(e)
        and (target_time is None or e["eventTime"] == target_time)
    ]

    if args.mode == "hour-before" and not target_events:
        print(f"✅ 1시간 전 알림 대상 없음: {target_date} {target_time}")
        return

    message = format_message(target_date, target_events)

    if args.mode == "hour-before":
        message = message.replace(
            "🌲 ForestTime 예약 오픈 알림",
            f"🌲 ForestTime 1시간 전 알림\n\n⏳ {target_time} 오픈 예정",
            1,
        )

    print(message)
    print()

    if args.dry_run:
        print("✅ dry-run 모드: 텔레그램 발송은 하지 않았습니다.")
        return

    send_telegram(message)
    print("✅ 텔레그램 발송 완료")


if __name__ == "__main__":
    main()
