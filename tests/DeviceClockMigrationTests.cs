using Microsoft.Data.Sqlite;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using SleepyKoala.Api.Data;
using SleepyKoala.Api.Models;

namespace SleepyKoala.Tests;

public class DeviceClockMigrationTests
{
    [Fact]
    public async Task RemoveSavedTimeZone_PreservesExistingSleepRecordsAndTrackingStart()
    {
        await using var connection = new SqliteConnection("Data Source=:memory:");
        await connection.OpenAsync();
        await using var db = new ApplicationDbContext(new DbContextOptionsBuilder<ApplicationDbContext>()
            .UseSqlite(connection).Options);
        var migrator = db.GetService<IMigrator>();
        await migrator.MigrateAsync("20261008125502_AddRegistrationIdempotency");
        var user = new User
        {
            Email = "migration@example.com", Nickname = "Koala", PasswordHash = "hash",
            CurrentStreak = 3, LongestStreak = 5
        };
        db.Users.Add(user);
        db.CheckIns.Add(new CheckIn
        {
            UserId = user.Id, LocalCheckInDate = "2026-10-30", Status = "onTime"
        });
        await db.SaveChangesAsync();
        // Seed the old schema explicitly, including its required timezone column.
        await db.Database.ExecuteSqlInterpolatedAsync($"""
            INSERT INTO UserSettings (UserId, CutoffTime, OnboardingCompleted, TimeZoneId, TrackingStartSleepDate)
            VALUES ({user.Id}, '22:00', 1, 'Pacific/Auckland', '2026-10-27')
            """);

        await migrator.MigrateAsync();
        db.ChangeTracker.Clear();
        var restored = await db.Users.Include(u => u.Settings).Include(u => u.CheckIns).SingleAsync();
        Assert.Equal(3, restored.CurrentStreak);
        Assert.Equal(5, restored.LongestStreak);
        Assert.Equal("2026-10-27", restored.Settings!.TrackingStartSleepDate);
        Assert.Equal("2026-10-30", Assert.Single(restored.CheckIns).LocalCheckInDate);
        await using var command = connection.CreateCommand();
        command.CommandText = "SELECT COUNT(*) FROM pragma_table_info('UserSettings') WHERE name = 'TimeZoneId'";
        Assert.Equal(0L, await command.ExecuteScalarAsync());
    }
}
