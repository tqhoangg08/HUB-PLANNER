# practice-generate

Supabase Edge Function tao bo de trac nghiem tu tai lieu sinh vien cung cap.

## Provider order

Mac dinh:

```txt
groq,deepinfra,openrouter,cerebras,openai
```

Doi thu tu:

```powershell
.\supabase.exe secrets set PRACTICE_AI_PROVIDER_ORDER=groq,deepinfra,openrouter
```

Function se thu tung provider co API key. Provider loi hoac het quota thi fallback provider tiep theo.

## Secrets nen set

```powershell
.\supabase.exe secrets set PRACTICE_GROQ_API_KEY=...
.\supabase.exe secrets set DEEPINFRA_API_KEY=...
.\supabase.exe secrets set OPENROUTER_API_KEY=...
.\supabase.exe secrets set PRACTICE_AI_PROVIDER_ORDER=groq,deepinfra,openrouter
```

Neu co nhieu key, dung bien comma-separated:

```powershell
.\supabase.exe secrets set PRACTICE_GROQ_API_KEYS=groq1,groq2,groq3,groq4,groq5
.\supabase.exe secrets set PRACTICE_DEEPINFRA_API_KEYS=deepinfra1,deepinfra2,deepinfra3,deepinfra4,deepinfra5
.\supabase.exe secrets set PRACTICE_OPENROUTER_API_KEYS=openrouter1,openrouter2,openrouter3,openrouter4,openrouter5
```

Khong mac dinh dung `GROQ_API_KEY` den `GROQ_API_KEY_5` vi cac key nay dang duoc dung cho luong import/OCR PDF. Neu muon cho luyen de dung chung pool Groq cu, bat rieng:

```powershell
.\supabase.exe secrets set PRACTICE_USE_SHARED_GROQ_KEYS=true
```

Tuy chon them:

```powershell
.\supabase.exe secrets set CEREBRAS_API_KEY=...
.\supabase.exe secrets set OPENAI_API_KEY=...
```

## Model overrides

```powershell
.\supabase.exe secrets set PRACTICE_AI_GROQ_MODEL=llama-3.3-70b-versatile
.\supabase.exe secrets set PRACTICE_AI_DEEPINFRA_MODEL=Qwen/Qwen2.5-72B-Instruct
.\supabase.exe secrets set PRACTICE_AI_OPENROUTER_MODEL=qwen/qwen-2.5-72b-instruct
.\supabase.exe secrets set PRACTICE_AI_CEREBRAS_MODEL=qwen-3-32b
.\supabase.exe secrets set PRACTICE_AI_OPENAI_MODEL=gpt-4.1-mini
```

## Deploy

```powershell
.\supabase.exe functions deploy practice-generate
```
