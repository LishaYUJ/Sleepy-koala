# Personal check-in summary

The History page includes a date-range summary from `GET /api/checkins/me/summary?from=yyyy-MM-dd&to=yyyy-MM-dd`.
The authenticated claim determines the user; the client cannot supply another user's ID.

## Metric definitions

- Dates are inclusive sleep dates (`LocalCheckInDate`), not UTC creation dates. After-midnight check-ins belong to the preceding evening, using the existing check-in rules.
- Valid records have a saved status of `onTime` or `late`. Inferred missing nights are excluded.
- Total = on-time + late.
- On-time rate = 100 × on-time / total, rounded to one decimal place. Zero total produces JSON null, displayed as `—`.
- Weeks start Monday. First/last weeks are clipped to the selected range; weeks without records have zero counts.
- Saved historical statuses are used without recalculating against today's bedtime goal.
- Ranges may contain at most 366 days. Unlike the calendar history endpoint, the summary does not silently truncate older data.
- The initial selection is the last 28 calendar dates on the browser; dates subsequently refer to stored sleep dates regardless of the browser timezone.

This metric describes punctuality **among recorded check-ins**. It is not sleep quality, bedtime compliance, or attendance. Missing-night inference pauses after seven consecutive missing days, so inferred history is not a reliable denominator for an attendance rate.

## Code walkthrough

1. `CheckInsController.GetMySummary` validates login and date input.
2. `CheckInSummaryService.GetAsync` filters the database by user, sleep date and valid status, then builds weekly buckets and totals.
3. `CheckInSummary.tsx` sends the selected range, displays the returned counts, and handles loading, errors and empty results.
4. Tests cover range boundaries, cross-year weeks, empty weeks, sleep-date attribution, and user isolation.
