# Product Requirements Document (PRD): AfterDark
**Version:** 1.0  
**Target Platform:** Web Application (Desktop & Mobile Responsive)  
**Primary Tooling Target:** create.xyz

---

## 1. Executive Summary
**AfterDark** is a premium, specialized marketplace connecting NYC nightlife venues (clubs, lounges, bars) with world-class nightlife talent (DJs, mixologists, security, promoters, stage managers, etc.). The platform manages the entire lifecycle of a gig: from posting and discovery to application, negotiation, scheduling, and guaranteed payouts via Stripe Connect.

## 2. User Personas & Core Workflows

### A. Talent (e.g., DJs, Hosts, Performers, Mixologists, Promoters, Security)
* **Goal:** Find high-paying gigs, manage schedules, and guarantee payment.
* **Core Flow:** Landing Page → Sign Up/In → Complete Profile & Set Availability → Browse Gigs (Map/List) → View Gig Details → Apply & Propose Rate → Negotiate in Messages → View Talent Dashboard for upcoming gigs.
    - Live Operations (Check-in/out) for event worked → Get paid for time worked (System should be able to manage Venue/Promoter → Talent, Venue → Promoter, Promoter → Venue).
    * **Sub-category core flow for Promoters:**
        - Live Operations (Check-in/out) for event managed → Get paid for ticket sales/time worked managed by Venue (ticket sales for most parties wil be handled by external ticketing systems).

### B. Venue Operators (e.g., Booking Managers, Club Owners)
* **Goal:** Quickly source vetted talent, manage nightlife operations, and handle safe payouts.
* **Core Flow:** Landing Page → Sign Up/In → Complete Profile (set typical day rates/hourly rates) → Setup connections to External calendar and ticket management systems → Venue Dashboard → Create New Gig → Review Applicants → Shortlist/Hire → Negotiate in Messages → Live Operations (Check-in/out).
    - Live Operations (Check-in/out) → Get paid for time worked

### C. Administrators
* **Goal:** Ensure platform health, safety, and resolve disputes.
* **Core Flow:** Admin Dashboard → Review Audit Logs → Moderate Active Disputes → Manage User Verification.

---

## 3. Screen-by-Screen Requirements (UI/UX)

### 3.1 Landing Page
* **Hero Section:** High-impact background, tagline ("Your Next Night Out Starts Here"), and CTA buttons ("Post a Gig", "Browse Gigs").
* **Featured Section:** Carousel of "Urgent/Hot Tonight" listings.
* **Value Proposition / Roles:** Columns explaining the platform for "Talent", "Venues", and "Party People".
* **Workflow Diagram:** Visual representation of the "Fastest Path from Post → Book → Payout".

### 3.2 Talent Views
* **Browse Dashboard:**
    * *Filters:* Neighborhoods, Pay Range, Role Types (DJ, Bartender, Security, etc.), Genres.
    * *Views:* Toggle between List View and Map View (interactive map with pins).
    * *Content:* Gig cards displaying role, pay, venue, time, and distance.
* **Gig Details & Application:**
    * *Content:* Comprehensive gig info, Fixed/Hourly payout, required equipment (e.g., CDJ-3000s), and venue rating.
    * *Action:* Application form allowing talent to input their "Proposed Hourly Rate" and a "Cover Message". Displays a net earnings estimator (minus a 5% marketplace fee).
* **Availability Management:**
    * *UI:* Interactive Calendar.
    * *Functionality:* Talent selects dates and toggles availability for specific time slots: Early Evening (6PM-10PM), Prime Time (10PM-2AM), After Hours (2AM-6AM).
* **Talent Dashboard:**
    * *Metrics:* Total Earnings, Profile Completion %.
    * *Sections:* Active Applications, Upcoming Gigs (with "Check In" actions), and Hot Gigs Tonight.
* **Public Profile Editor:**
    * *Sections:* Media Gallery (up to 4 action shots), The Basics (Stage Name, Bio, Pronouns), Roles & Vibes (Tags), Hourly Rate Range, and Digital Presence (SoundCloud, Instagram, TikTok links).

### 3.3 Venue Views
* **Venue Dashboard:**
    * *Metrics:* Payouts Pending, Avg Time to Hire, Filling Rate.
    * *Open Gigs Table:* Tracks active gigs and applicant counts. Click to view candidates.
    * *Active Operations Live Tonight:* Real-time tracker of hired talent, their call times, and check-in/checkout controls.
* **Create Gig:**
    * *Form Steps:* Identity & Role (Title, Sub-genre) → Logistics (Start/End time, Location) → Compensation (Base Rate, Cash Tips toggle, Payment Type) → Equipment & Attire.
    * *Live Feature:* Shows "Live Analytics" matching candidates in the area as the form is filled out.
* **Applicant Tracking (Sub-view of Dashboard):**
    * List of applicants with their ratings, roles, and status. Buttons to "Shortlist" or "Hire".

### 3.4 Shared & Admin Views
* **Messages:**
    * *Layout:* Two-pane layout (Chat list on left, Active conversation on right).
    * *Features:* Real-time chat, ability to share attachments (e.g., Tech Riders as PDF), and inline "Propose Rate" tools for negotiation. Contextual gig sidebar on the far right.
* **Admin Moderation Dashboard:**
    * *Metrics:* Uptime, Total Users, Platform Traffic.
    * *Sections:* Active Disputes / Reports Triage (Immediate action required), Audit Logs (Live feed of moderation events).

---

## 4. Database Schema Structure

Below is the drafted relational database structure needed to support the AfterDark platform.

### `Users` Table
* `id` (UUID, Primary Key)
* `email` (String, Unique)
* `password_hash` (String)
* `role` (Enum: `TALENT`, `VENUE`, `ADMIN`)
* `created_at` (Timestamp)

### `TalentProfiles` Table
* `id` (UUID, Primary Key)
* `user_id` (UUID, Foreign Key -> Users)
* `stage_name` (String)
* `neighborhood` (String)
* `bio` (Text)
* `pronouns` (String)
* `hourly_rate_min` (Decimal)
* `hourly_rate_max` (Decimal)
* `social_links` (JSON: instagram, tiktok, soundcloud)
* `profile_completion_pct` (Integer)

### `VenueProfiles` Table
* `id` (UUID, Primary Key)
* `user_id` (UUID, Foreign Key -> Users)
* `venue_name` (String)
* `address` (String)
* `description` (Text)
* `rating` (Decimal, 0-5)

### `Gigs` Table
* `id` (UUID, Primary Key)
* `venue_id` (UUID, Foreign Key -> VenueProfiles)
* `title` (String)
* `role_needed` (String)
* `description` (Text)
* `start_time` (Timestamp)
* `end_time` (Timestamp)
* `base_rate` (Decimal)
* `tips_included` (Boolean)
* `status` (Enum: `DRAFT`, `PUBLISHED`, `FILLED`, `COMPLETED`, `CANCELLED`)

### `Applications` Table
* `id` (UUID, Primary Key)
* `gig_id` (UUID, Foreign Key -> Gigs)
* `talent_id` (UUID, Foreign Key -> TalentProfiles)
* `proposed_rate` (Decimal)
* `cover_message` (Text)
* `status` (Enum: `PENDING`, `SHORTLISTED`, `HIRED`, `REJECTED`)
* `created_at` (Timestamp)

### `Messages` Table
* `id` (UUID, Primary Key)
* `gig_id` (UUID, Foreign Key -> Gigs)
* `sender_id` (UUID, Foreign Key -> Users)
* `receiver_id` (UUID, Foreign Key -> Users)
* `content` (Text)
* `attachment_url` (String, Nullable)
* `created_at` (Timestamp)

### `Availabilities` Table
* `id` (UUID, Primary Key)
* `talent_id` (UUID, Foreign Key -> TalentProfiles)
* `date` (Date)
* `time_slot` (Enum: `EARLY_EVENING`, `PRIME_TIME`, `AFTER_HOURS`)
* `status` (Enum: `AVAILABLE`, `BOOKED`, `BLOCKED`)

### `Reports` Table (Admin)
* `id` (UUID, Primary Key)
* `reporter_id` (UUID, Foreign Key -> Users)
* `reported_entity_id` (UUID)
* `reason` (Text)
* `severity` (Enum: `LOW`, `MEDIUM`, `HIGH`)
* `status` (Enum: `OPEN`, `REVIEWING`, `CLOSED`)

---

## 5. Development Notes for create.xyz AI
* **Design System:** Use a dark-mode theme by default. Primary background `#121212`, card backgrounds `#1E1E1E`. Use a striking neon accent color (e.g., `#00FFCC` or Cyan) for primary CTA buttons and active states.
* **Routing Architecture:** Ensure deep linking is supported. The UX workflow requires fluid movement from Dashboard -> Gig Details -> Messages.
* **Components to Build First:**
    1.  Sidebar Navigation (Modular based on User Role).
    2.  Data Table component (used heavily in Admin and Venue Dashboards).
    3.  Gig Card Component (used in Browse and Dashboard views).
    4.  Chat Interface Component.
