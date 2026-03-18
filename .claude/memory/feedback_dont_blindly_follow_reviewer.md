---
name: feedback_dont_blindly_follow_reviewer
description: Never blindly follow code reviewer suggestions that change intentional behavior - always verify with the user first
type: feedback
---

Do NOT blindly implement code reviewer suggestions that change intentional behavior. The `.reverse()` on chat history messages was intentional (latest messages on top), but I removed it because a reviewer flagged it as a "bug."

**Why:** The user was angry because I changed working, intentional behavior based on a reviewer's assumption. The reviewer didn't know the design intent.

**How to apply:** When a reviewer flags something as a bug, check if it was an intentional design choice before changing it. If unsure, ask the user. Never assume the reviewer is right about product behavior.
