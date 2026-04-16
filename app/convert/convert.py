import pandas as pd
import json

excel_file = "forest_sample_template.xlsx"
json_file = "forest.json"

df = pd.read_excel(excel_file).fillna("")

records = []

for i, row in df.iterrows():
    records.append({
        "id": i + 1,
        "zone": row.get("권역", ""),
        "region": row.get("지역", ""),
        "name": row.get("시설명", ""),
        "facilityType": row.get("시설유형", ""),
        "operatorType": row.get("운영주체", ""),
        "firstComeRule": row.get("오픈규칙 (선착순)", ""),
        "lotteryRule": row.get("오픈규칙 (추첨제)", ""),
        "lotteryTarget": row.get("추첨대상", ""),
        "lotteryResult": row.get("추첨발표", ""),
        "waitingOpen": row.get("미결제/대기예약 오픈", ""),
        "note": row.get("비고", ""),
        "homepage": row.get("홈페이지", ""),
        "localPriorityPolicy": row.get("지역주민 우선예약정책", ""),
        "recommendedRoomMemo": row.get("추천객실메모", ""),
    })

with open(json_file, "w", encoding="utf-8") as f:
    json.dump(records, f, ensure_ascii=False, indent=2)

print("✅ JSON 변환 완료!")