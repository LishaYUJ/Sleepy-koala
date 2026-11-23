using Microsoft.EntityFrameworkCore;
using SleepyKoala.Api.Data;

namespace SleepyKoala.Api.Services;

public record CheckInWeek(string WeekStart, string From, string To, int OnTime, int Late)
{
    public int Total => OnTime + Late;
}
public record CheckInSummary(string From, string To, int OnTime, int Late, List<CheckInWeek> Weeks)
{
    public int Total => OnTime + Late;
    public decimal? OnTimeRate => Total == 0 ? null : Math.Round(100m * OnTime / Total, 1);
}

public class CheckInSummaryService(ApplicationDbContext context)
{
    public static (DateOnly From, DateOnly To) ParseRange(string from, string to)
    {
        if (!DateOnly.TryParseExact(from, "yyyy-MM-dd", out var start) ||
            !DateOnly.TryParseExact(to, "yyyy-MM-dd", out var end) || start > end ||
            end.DayNumber - start.DayNumber > 365)
            throw new ArgumentException("Choose a valid sleep-date range of at most 366 days (yyyy-MM-dd).");
        return (start, end);
    }

    public async Task<CheckInSummary> GetAsync(Guid userId, DateOnly from, DateOnly to)
    {
        var start = from.ToString("yyyy-MM-dd");
        var end = to.ToString("yyyy-MM-dd");
        // ISO sleep-date strings sort chronologically. Query real records, never inferred missing nights.
        var records = await context.CheckIns.AsNoTracking()
            .Where(c => c.UserId == userId && (c.Status == "onTime" || c.Status == "late") &&
                c.LocalCheckInDate.CompareTo(start) >= 0 && c.LocalCheckInDate.CompareTo(end) <= 0)
            .Select(c => new { c.LocalCheckInDate, c.Status }).ToListAsync();
        var valid = records.Where(c => DateOnly.TryParseExact(c.LocalCheckInDate, "yyyy-MM-dd", out _)).ToList();
        var weeks = new List<CheckInWeek>();
        var monday = from.AddDays(-(((int)from.DayOfWeek + 6) % 7));
        for (var day = monday; day <= to;)
        {
            var weekFrom = day < from ? from : day;
            var weekTo = to.DayNumber - day.DayNumber < 6 ? to : day.AddDays(6);
            var a = weekFrom.ToString("yyyy-MM-dd");
            var b = weekTo.ToString("yyyy-MM-dd");
            var entries = valid.Where(c => string.CompareOrdinal(c.LocalCheckInDate, a) >= 0 &&
                string.CompareOrdinal(c.LocalCheckInDate, b) <= 0).ToList();
            weeks.Add(new(day.ToString("yyyy-MM-dd"), a, b,
                entries.Count(c => c.Status == "onTime"), entries.Count(c => c.Status == "late")));
            if (to.DayNumber - day.DayNumber < 7) break;
            day = day.AddDays(7);
        }
        return new(start, end, weeks.Sum(w => w.OnTime), weeks.Sum(w => w.Late), weeks);
    }
}
