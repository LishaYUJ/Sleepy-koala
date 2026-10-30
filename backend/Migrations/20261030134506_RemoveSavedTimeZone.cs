using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SleepyKoala.Api.Migrations
{
    /// <inheritdoc />
    public partial class RemoveSavedTimeZone : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "TimeZoneId",
                table: "UserSettings");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "TimeZoneId",
                table: "UserSettings",
                type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "nvarchar(100)" : "TEXT",
                maxLength: 100,
                nullable: false,
                defaultValue: "UTC");
        }
    }
}
