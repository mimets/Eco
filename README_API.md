# EcoTrack REST API Documentation

Base URL: `https://ecotrack-dmqy.onrender.com` (or your local environment)

## Authentication

### POST `/api/register`
Registers a new user.
- **Body**: `{ name, username, email, password }`

### POST `/api/login`
Logs in a user and returns a JWT token.
- **Body**: `{ identifier, password }` (identifier can be email or username)
- **Response**: `{ token, user: { ... } }`

### POST `/api/forgot-password`
Sends a password reset email.
- **Body**: `{ email }`

### POST `/api/reset-password`
Resets the password using a token.
- **Body**: `{ token, new_password }`

---

## Activities

### GET `/api/activities`
Retrieves the list of activities for the authenticated user.

### POST `/api/activities`
Logs a new green activity.
- **Body**: `{ type, km, hours, note, from_addr, to_addr, date, carpool_user_id }`
- **Types**: `Bici`, `Treno`, `Bus`, `Carpooling`, `Remoto`, `Videocall`, `Pasto Veg`, `Riciclo`, `Energia`.

---

## Profile & Stats

### GET `/api/profile`
Returns the current user's profile information.

### PUT `/api/profile`
Updates profile information (name, username, bio).

### GET `/api/stats`
Returns CO2 saving statistics (total, week, month).

### GET `/api/badges`
Returns the list of badges and their unlocked status.

---

## Social & Teams

### GET `/api/social/posts`
Retrieves community posts.

### POST `/api/social/posts`
Creates a new post.
- **Body**: `{ content, image_url }`

### GET `/api/teams`
Lists the teams the user is part of.

### POST `/api/teams`
Creates a new team.
- **Body**: `{ name, description, avatar_color }`

---

## AI Advisor

### POST `/api/ai-advisor`
Ask a question to the Eco-AI assistant.
- **Body**: `{ question }`
