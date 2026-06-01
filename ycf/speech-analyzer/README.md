# YCF Speech Analyzer

HTTP function for linguistic analysis of statement agency and objective rewriting through DeepSeek API.

## Deploy

```bash
cd ycf/speech-analyzer
DEEPSEEK_API_KEY='<your-deepseek-key>' ./deploy.sh
```

Optional env vars:
- `FUNCTION_NAME` (default: `np-speech-agency-analyzer`)
- `RUNTIME` (default: `nodejs22`)
- `MEMORY` (default: `256m`)
- `TIMEOUT` (default: `15s`)

## Request

```bash
curl -X POST '<http_invoke_url>' \
  -H 'Content-Type: application/json' \
  --data '{"text":"Меня постоянно недооценивают"}'
```

## Response shape

```json
{
  "results": {
    "neutral": { "label": "...", "irritabilityLevel": 10, "key": "neutral", "objective_text": "...", "agency_analysis": "..." },
    "direct": { "label": "...", "irritabilityLevel": 30, "key": "direct", "objective_text": "...", "agency_analysis": "..." },
    "radical": { "label": "...", "irritabilityLevel": 55, "key": "radical", "objective_text": "...", "agency_analysis": "..." },
    "aggressive": { "label": "...", "irritabilityLevel": 78, "key": "aggressive", "objective_text": "...", "agency_analysis": "..." },
    "toxic": { "label": "...", "irritabilityLevel": 95, "key": "toxic", "objective_text": "...", "agency_analysis": "..." }
  }
}
```
