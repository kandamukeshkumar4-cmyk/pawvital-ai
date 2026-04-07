# PawVital AI — API Overview

## Base URL

- **Production**: `https://pawvital.ai/api`
- **Local Development**: `http://localhost:3000/api`

## Authentication

All API routes require authentication via Supabase Auth. Requests must include a valid session cookie or Authorization header with a Supabase JWT token.

Unauthenticated requests receive a `401 Unauthorized` response.

## Rate Limiting

Rate limiting is implemented via Upstash Redis:

| Tier | Limit | Window |
|------|-------|--------|
| Free | 10 requests | per hour |
| Premium | 100 requests | per hour |
| Burst protection | 5 requests | per 10 seconds |

Rate-limited requests receive a `429 Too Many Requests` response with a `Retry-After` header.

---

## API Routes

### `/api/ai/symptom-chat`

**Purpose**: Main symptom triage conversation endpoint. Handles multi-turn conversations with clinically structured follow-up questions.

**Method**: `POST`

**Request Body**:
```json
{
  "message": "My dog has been limping on his back left leg",
  "sessionId": "optional-session-uuid",
  "petProfile": {
    "name": "Cooper",
    "species": "dog",
    "breed": "Golden Retriever",
    "age": 11,
    "weight": 75
  }
}
```

**Response**:
```json
{
  "reply": "I'll help you assess the limping. How long has this been going on?",
  "sessionId": "uuid",
  "state": "gathering",
  "turnCount": 1
}
```

**States**: `greeting` → `gathering` → `analyzing` → `reporting` → `complete`

---

### `/api/ai/symptom-check`

**Purpose**: Single-shot symptom analysis (non-conversational). Returns a full report from a single description.

**Method**: `POST`

**Request Body**:
```json
{
  "symptoms": "limping on back left leg for 3 days",
  "petProfile": {
    "species": "dog",
    "breed": "Dachshund",
    "age": 7
  }
}
```

**Response**: Full SOAP-format report with differential diagnoses, urgency rating, and evidence citations.

---

### `/api/ai/health-score`

**Purpose**: Calculate a daily health score (1-100) based on the pet's profile and logged data.

**Method**: `POST`

**Request Body**:
```json
{
  "petId": "uuid",
  "factors": {
    "recentSymptoms": [],
    "activityLevel": "normal",
    "appetiteLevel": "normal"
  }
}
```

**Response**:
```json
{
  "score": 87,
  "label": "Excellent",
  "factors": { ... },
  "recommendations": [...]
}
```

---

### `/api/ai/supplements`

**Purpose**: Generate personalized supplement recommendations based on pet profile (breed, age, weight, conditions).

**Method**: `POST`

---

### `/api/ai/outcome-feedback`

**Purpose**: Capture user feedback on diagnosis accuracy after a vet visit.

**Method**: `POST`

---

### `/api/auth/callback`

**Purpose**: Supabase Auth callback handler for OAuth sign-in flows.

**Method**: `GET`

---

### `/api/stripe/checkout`

**Purpose**: Create a Stripe Checkout session for premium subscription.

**Method**: `POST`

---

### `/api/stripe/webhook`

**Purpose**: Handle Stripe webhook events (subscription created, updated, canceled).

**Method**: `POST`

---

### `/api/triage/next`

**Purpose**: Internal triage state machine endpoint. Advances the conversation state based on the current turn.

**Method**: `POST`

---

## Error Response Format

All API errors follow a consistent format:

```json
{
  "error": "Human-readable error message",
  "code": "ERROR_CODE",
  "statusCode": 400
}
```

Common error codes:
- `RATE_LIMITED` — Too many requests
- `UNAUTHORIZED` — Missing or invalid auth
- `VALIDATION_ERROR` — Invalid request body
- `INTERNAL_ERROR` — Server-side failure
- `SESSION_EXPIRED` — Conversation session timed out
