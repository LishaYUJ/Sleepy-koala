using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.Models;
using SleepyKoala.Api.Services;

namespace SleepyKoala.Tests;

public class CheckInSummaryTests
{
    [Theory]
    [InlineData("bad", "2026-01-01")]
    [InlineData("2026-02-30", "2026-03-01")]
    [InlineData("2026-03-02", "2026-03-01")]
    [InlineData("2025-01-01", "2026-01-02")]
    public void InvalidRangesAreRejected(string from, string to) =>
        Assert.Throws<ArgumentException>(() => CheckInSummaryService.ParseRange(from, to));

    [Fact]
    public async Task CountsOnlyOwnValidSleepDatesAndIncludesEmptyWeeks()
    {
        using var connection = new SqliteConnection("Data Source=:memory:");
        connection.Open();
        using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>().UseSqlite(connection).Options);
        db.Database.EnsureCreated();
        var owner = new User { Email = "one@example.com", Nickname = "One", PasswordHash = "hash" };
        var other = new User { Email = "two@example.com", Nickname = "Two", PasswordHash = "hash" };
        db.Users.AddRange(owner, other);
        void Add(User user, string date, string status) => db.CheckIns.Add(new CheckIn
        {
            UserId = user.Id, LocalCheckInDate = date, Status = status,
            // UTC click date intentionally differs: aggregation must use the sleep date.
            CreatedAtUtc = new DateTime(2026, 1, 2, 1, 0, 0, DateTimeKind.Utc)
        });
        Add(owner, "2025-12-28", "onTime"); // outside range
        Add(owner, "2025-12-31", "onTime");
        Add(owner, "2026-01-01", "late");
        Add(owner, "2026-01-02", "missing");
        Add(owner, "2026-01-12", "onTime");
        Add(owner, "2026-01-13", "onTime"); // outside range
        Add(other, "2026-01-03", "onTime");
        await db.SaveChangesAsync();
        var service = new CheckInSummaryService(db);
        var summary = await service.GetAsync(owner.Id, new(2025, 12, 31), new(2026, 1, 12));
        Assert.Equal(3, summary.Total);
        Assert.Equal(2, summary.OnTime);
        Assert.Equal(1, summary.Late);
        Assert.Equal(66.7m, summary.OnTimeRate);
        Assert.Equal(3, summary.Weeks.Count);
        Assert.Equal("2025-12-29", summary.Weeks[0].WeekStart);
        Assert.Equal("2025-12-31", summary.Weeks[0].From);
        Assert.Equal(0, summary.Weeks[1].Total);
        Assert.Equal("2026-01-12", summary.Weeks[2].To);
        var empty = await service.GetAsync(Guid.NewGuid(), new(2026, 1, 1), new(2026, 1, 1));
        Assert.Equal(0, empty.Total);
        Assert.Null(empty.OnTimeRate);
        Assert.Single(empty.Weeks);
    }

}
