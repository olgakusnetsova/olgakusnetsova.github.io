"use strict";

const crypto = require("node:crypto");
const aws4 = require("aws4");

const REQUIRED_FILTERS = [
  "neutral",
  "direct",
  "radical",
  "aggressive",
  "toxic"
];

const FILTER_METADATA = {
  neutral: { label: "Нейтральный", irritabilityLevel: 10 },
  direct: { label: "Прямолинейный", irritabilityLevel: 30 },
  radical: { label: "Радикальный", irritabilityLevel: 55 },
  aggressive: { label: "Агрессивный", irritabilityLevel: 78 },
  toxic: { label: "Токсичный", irritabilityLevel: 95 }
};

const DOCAPI_ENDPOINT = process.env.DOCAPI_ENDPOINT || "";
const DOCAPI_REGION = process.env.DOCAPI_REGION || "ru-central1";
const DOCAPI_ACCESS_KEY_ID = process.env.DOCAPI_ACCESS_KEY_ID || "";
const DOCAPI_SECRET_ACCESS_KEY = process.env.DOCAPI_SECRET_ACCESS_KEY || "";
const YDB_TABLE = process.env.YDB_TABLE || "speech_agency_logs";

let ydbTableReady = false;
let ydbEnsureTablePromise = null;

function corsHeaders(origin) {
  return {
    "Access-Control-Allow-Origin": origin || "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Max-Age": "600",
    "Content-Type": "application/json; charset=utf-8"
  };
}

function jsonResponse(statusCode, body, origin) {
  return {
    statusCode,
    headers: corsHeaders(origin),
    body: JSON.stringify(body)
  };
}

function extractJsonObject(raw) {
  if (!raw || typeof raw !== "string") return null;
  const fenced = raw.match(/```json\s*([\s\S]*?)\s*```/i);
  const candidate = fenced ? fenced[1] : raw;
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) return null;
  const slice = candidate.slice(start, end + 1);
  try {
    return JSON.parse(slice);
  } catch (_err) {
    return null;
  }
}

function normalizeResponse(parsed) {
  if (!parsed || typeof parsed !== "object") {
    throw new Error("DeepSeek returned invalid JSON");
  }

  const out = {};

  for (const key of REQUIRED_FILTERS) {
    const node = parsed[key];
    if (!node || typeof node !== "object") {
      throw new Error(`Missing filter block: ${key}`);
    }

    const objectiveText = String(node.objective_text || "").trim();
    const agencyAnalysis = String(node.agency_analysis || "").trim();

    if (!objectiveText) {
      throw new Error(`Missing objective_text for ${key}`);
    }

    out[key] = {
      ...FILTER_METADATA[key],
      key,
      objective_text: objectiveText,
      agency_analysis: agencyAnalysis
    };
  }

  return out;
}

async function callDocApi(target, payload) {
  if (!DOCAPI_ENDPOINT || !DOCAPI_ACCESS_KEY_ID || !DOCAPI_SECRET_ACCESS_KEY) {
    throw new Error("Document API environment is not configured");
  }

  const url = new URL(DOCAPI_ENDPOINT);
  const body = JSON.stringify(payload);
  const request = {
    host: url.host,
    path: url.pathname,
    service: "dynamodb",
    region: DOCAPI_REGION,
    method: "POST",
    headers: {
      "Content-Type": "application/x-amz-json-1.0",
      "X-Amz-Target": target
    },
    body
  };

  aws4.sign(request, {
    accessKeyId: DOCAPI_ACCESS_KEY_ID,
    secretAccessKey: DOCAPI_SECRET_ACCESS_KEY
  });

  const response = await fetch(url.toString(), {
    method: "POST",
    headers: request.headers,
    body
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : {};
  if (!response.ok) {
    const code = data.__type || data.code || response.status;
    const msg = data.message || data.Message || "DocAPI request failed";
    const err = new Error(`${code}: ${msg}`);
    err.code = code;
    throw err;
  }
  return data;
}

async function ensureYdbTable() {
  if (ydbTableReady) return;
  if (ydbEnsureTablePromise) return ydbEnsureTablePromise;

  ydbEnsureTablePromise = (async () => {
    try {
      await callDocApi("DynamoDB_20120810.DescribeTable", {
        TableName: YDB_TABLE
      });
      ydbTableReady = true;
      return;
    } catch (err) {
      const code = String(err && err.code ? err.code : "");
      if (!code.includes("ResourceNotFoundException")) {
        throw err;
      }
    }

    await callDocApi("DynamoDB_20120810.CreateTable", {
      TableName: YDB_TABLE,
      BillingMode: "PAY_PER_REQUEST",
      AttributeDefinitions: [
        { AttributeName: "id", AttributeType: "S" }
      ],
      KeySchema: [
        { AttributeName: "id", KeyType: "HASH" }
      ]
    });

    ydbTableReady = true;
  });
  try {
    await ydbEnsureTablePromise;
  } catch (err) {
    ydbEnsureTablePromise = null;
    throw err;
  }
  return ydbEnsureTablePromise;
}

async function persistInteraction(text, results) {
  if (!DOCAPI_ENDPOINT) return;
  await ensureYdbTable();

  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  const payload = {
    text,
    results
  };

  await callDocApi("DynamoDB_20120810.PutItem", {
    TableName: YDB_TABLE,
    Item: {
      id: { S: id },
      payload: { S: JSON.stringify(payload) },
      created_at: { S: createdAt }
    }
  });
}

async function analyzeWithDeepSeek(text, apiKey) {
  const systemPrompt = [
    "Ты лингвистический аналитик агентности высказывания.",
"Твоя задача: проанализировать исходную фразу и дать 5 версий переформулировки на более объективный язык.",
"Сохраняй факты исходного сообщения. Убирай когнитивные искажения, ярлыки, чтение мыслей и эмоциональные обобщения.",
"Каждая версия ДОЛЖНА содержать субъект 'я' и конкретное действие или бездействие.",
"Если действие не указано, формулируй его как отсутствие действия ('я не делаю', 'я не начинаю', 'я откладываю').",
"Ответ строго в валидном JSON без пояснений и без markdown.",
"Формат JSON:",
"{",
"  \"neutral\": { \"objective_text\": string, \"agency_analysis\": string },",
"  \"direct\": { \"objective_text\": string, \"agency_analysis\": string },",
"  \"radical\": { \"objective_text\": string, \"agency_analysis\": string },",
"  \"aggressive\": { \"objective_text\": string, \"agency_analysis\": string },",
"  \"toxic\": { \"objective_text\": string, \"agency_analysis\": string }",
"}",
"Требования к стилям:",
"neutral: максимально нейтральный, спокойный, фактический, без оценок.",
"direct: коротко и прямо, но без оскорблений.",
"radical: предельно жесткая деконструкция самообмана, но в рамках анализа.",
"aggressive: резкий, конфронтационный тон без прямых угроз.",
"toxic: намеренно провокационный и манипулятивный тон (антипример).",
"objective_text: формулируй через субъектность 'я', с указанием действия/бездействия и ответственности. Избегай безличных и внешне-детерминированных конструкций (\"у меня не получается\", \"мне мешают обстоятельства\", \"так вышло\"). Преобразуй их в субъектные формулировки: \"я не делаю\", \"я не начинаю\", \"я откладываю\", \"я выбираю\". Если в исходной фразе ответственность вынесена вовне, явно верни её субъекту.",
"agency_analysis: укажи языковой маркер снятия ответственности и способ возврата субъектности (1-2 предложения)."
  ].join("\n");

  const payload = {
    model: "deepseek-chat",
    temperature: 0.5,
    messages: [
      { role: "system", content: systemPrompt },
      {
        role: "user",
        content: [
          "Исходная фраза для анализа:",
          text,
          "",
          "Сгенерируй все 5 фильтров сразу."
        ].join("\n")
      }
    ],
    response_format: {
      type: "json_object"
    }
  };

  const response = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message =
      (data && data.error && data.error.message) ||
      `DeepSeek error (${response.status})`;
    throw new Error(message);
  }

  const content =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;

  const parsed = extractJsonObject(content);
  return normalizeResponse(parsed);
}

module.exports.handler = async function handler(event) {
  const headers = event.headers || {};
  const origin = headers.origin || headers.Origin || "*";
  const method = (event.httpMethod || "POST").toUpperCase();

  if (method === "OPTIONS") {
    return {
      statusCode: 204,
      headers: corsHeaders(origin),
      body: ""
    };
  }

  if (method !== "POST") {
    return jsonResponse(405, { error: "Method not allowed" }, origin);
  }

  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    return jsonResponse(500, { error: "DEEPSEEK_API_KEY is not set" }, origin);
  }

  let parsedBody;
  try {
    parsedBody = event.body ? JSON.parse(event.body) : {};
  } catch (_err) {
    return jsonResponse(400, { error: "Invalid JSON body" }, origin);
  }

  const text = String(parsedBody.text || "").trim();
  if (!text) {
    return jsonResponse(400, { error: "Field 'text' is required" }, origin);
  }
  if (text.length > 500) {
    return jsonResponse(400, { error: "Text must be 500 characters or less" }, origin);
  }

  try {
    const results = await analyzeWithDeepSeek(text, apiKey);

    // Fire-and-forget persistence: response should not wait for DB write.
    (async () => {
      try {
        await persistInteraction(text, results);
      } catch (err) {
        console.error("YDB persistence failed:", err && err.message ? err.message : err);
      }
    })();

    return jsonResponse(200, { results }, origin);
  } catch (err) {
    return jsonResponse(502, {
      error: "DeepSeek request failed",
      details: err && err.message ? err.message : "Unknown error"
    }, origin);
  }
};
