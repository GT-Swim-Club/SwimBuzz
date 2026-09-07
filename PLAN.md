# Scrollbar below the pinned navbar

1. Make the root layout a viewport-height flex column with a nonshrinking navbar and a separate full-width content scroller. Inherit body overflow so existing dialog scroll locks still work.
2. Adapt practice sidebar wheel forwarding, sticky offsets, and editor drag scrolling to the content scroller.
3. Run focused lint and TypeScript checks, inspect layout behavior, and update graphify.

# Meet drop notifications

1. Add a default-on meetDrops preference and director-only settings on web and mobile.
2. Add MEET_SIGNUP_DROPPED notifications for successful self-withdrawals through shared signup logic; respect director preferences.
3. Generate Prisma, run focused lint/type checks and withdrawal behavior checks, and update graphify. Database enum must be applied before deployment.

Completed: meet drop preference, director-only web/mobile toggles, shared withdrawal notification hook, Prisma generation, and SQL deployment reference. Web/mobile TypeScript and targeted web lint passed. Mocked behavior checks passed for preference opt-out, director targeting, payload/push, withdrawal, duplicates, staff removals, and authorization/window failures. Mobile lint unavailable (no ESLint config). Graphify updated. Database enum SQL is prepared but not applied.
