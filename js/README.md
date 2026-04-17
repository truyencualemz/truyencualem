# MangaDesk — Thư mục data/

Thư mục này chứa file JSON backup của truyện chữ.

## Export / Import

- **Export**: Cài đặt → Export JSON → lưu vào thư mục này
- **Import**: Kéo file JSON vào trang Thư viện để import

## Cấu trúc file JSON (text chapter)

```json
{
  "chapId": "ch1234567890",
  "comicId": "c1234567890",
  "languages": ["vi", "en", "ja"],
  "segments": [
    {
      "id": "s1",
      "note": "Ghi chú tùy chọn",
      "content": {
        "vi": "Nobita thức dậy muộn như thường lệ.",
        "en": "Nobita woke up late as usual.",
        "ja": "のび太はいつものように遅く起きた。"
      },
      "annotations": [
        {
          "id": "a1",
          "phrase": {
            "vi": "thức dậy muộn",
            "en": "woke up late",
            "ja": "遅く起きた"
          }
        }
      ]
    }
  ]
}
```

## Mã ngôn ngữ hỗ trợ

| Code | Ngôn ngữ   |
|------|------------|
| vi   | Tiếng Việt |
| en   | English    |
| ja   | 日本語      |
| zh   | 中文        |
| ko   | 한국어      |
| fr   | Français   |
| de   | Deutsch    |
| es   | Español    |
