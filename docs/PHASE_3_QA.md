# Phase 3 Manual QA Checklist

## Setup
- Running backend at localhost:3000
- Two test users with complete profiles (User A, User B)
- One test host (User C) with a created OPEN activity
- Postman / curl with valid Firebase JWTs

---

## 1. User joins activity

**Steps:** POST /activities/:id/join with User A's JWT
**Expected:** 200, participant record with status JOINED
**Check:** GET /activities/:id/participants — User A appears

---

## 2. User leaves activity

**Steps:** DELETE /activities/:id/join with User A's JWT
**Expected:** 200, `{ success: true }`
**Check:** GET /activities/:id/participants — User A no longer in list

---

## 3. Duplicate join attempt

**Steps:** POST /activities/:id/join twice with same user JWT
**Expected:** First → 200, second → 409 with "already joined" message
**Check:** Only one JOINED record in DB

---

## 4. Activity becomes full

**Steps:** Fill activity to maxParticipants via join requests
**Expected:** After last valid join → activity.status = FULL
**Check:** GET /activities/:id shows status FULL; GET /activities list shows FULL

---

## 5. User tries joining full activity

**Steps:** POST /activities/:id/join against a FULL activity
**Expected:** 409 with "Activity is full"

---

## 6. Host tries joining own activity

**Steps:** POST /activities/:id/join with host's own JWT
**Expected:** 400 "Host cannot join their own activity"

---

## 7. Cancelled activity cannot be joined

**Steps:** Cancel an activity, then attempt join
**Expected:** 400 "Cannot join a cancelled activity"

---

## 8. Completed activity cannot be joined

**Steps:** Manually set activity status to COMPLETED in DB, then attempt join
**Expected:** 400 "Cannot join a completed activity"

---

## 9. Participant list visibility

**Steps:** GET /activities/:id/participants (authenticated)
**Expected:** List shows name, photoUrl, gender, joinedAt per participant
**Check:** No phone number, no firebaseUid, no phoneHash, no KYC data in response

---

## 10. User A cannot manipulate User B

**Steps:** User B tries DELETE /activities/:id/join with User A's activityId
**Expected:** 400 "You are not an active participant" (B never joined, or B's own record is returned from JWT)
**Check:** User A's participant record is unmodified

---

## 11. Non-host cannot remove participant

**Steps:** User A (not host) calls DELETE /activities/:id/participants/:participantId
**Expected:** 403 "Only the host can remove participants"

---

## 12. Host removes participant

**Steps:** Host calls DELETE /activities/:id/participants/:participantId for an active participant
**Expected:** 200 `{ success: true }`, participant no longer in GET participants list
**Check:** If activity was FULL, it transitions back to OPEN

---

## 13. Participant leaves and capacity becomes available

**Steps:**
1. Fill activity to max
2. One participant leaves (DELETE .../join)
**Expected:**
- Activity transitions from FULL to OPEN
- New user can now join (POST .../join succeeds)

---

## 14. Private activity cannot be accessed through participant endpoints

**Steps:** Create a PRIVATE activity; attempt GET /activities/:id/participants
**Expected:** 404 (activity not found — does not reveal existence)

---

## 15. Sensitive information not exposed

**Verify all participant/activity responses do not contain:**
- `phoneHash`
- `phoneEncrypted`
- `firebaseUid`
- `kycStatus`
- KYC document references
- Firebase tokens

---

## 16. Concurrent join behavior (capacity safety)

**Steps:**
1. Create activity with maxParticipants=2
2. One user already joined (1/2)
3. Fire two simultaneous join requests from different users (e.g., curl with &)
**Expected:**
- Exactly one succeeds (200)
- Other gets 409 full/conflict
- DB participant count = 2, never 3

---

## 17. Incomplete profile cannot join

**Steps:** Attempt join with a user whose profile.isComplete = false
**Expected:** 400 "Complete your profile before joining an activity"

---

## 18. Re-join after leaving

**Steps:**
1. User A joins
2. User A leaves
3. Activity is not full
4. User A joins again
**Expected:** 200 — same participant record updated to JOINED with fresh joinedAt

---

## 19. IDOR: participant from Activity A accessed via Activity B

**Steps:** Obtain a valid participantId from Activity A; call DELETE /activities/ACTIVITY_B/participants/PARTICIPANT_A
**Expected:** 404 (participant does not belong to activity B)

---

## 20. Unauthenticated access to mutation endpoints

**Steps:** POST /activities/:id/join without Authorization header
**Expected:** 401 Unauthorized
