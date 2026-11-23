using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace SleepyKoala.Api.Migrations
{
    /// <inheritdoc />
    public partial class AddWebPushReminders : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "PushDevices",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "uniqueidentifier" : "TEXT", nullable: false),
                    UserId = table.Column<Guid>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "uniqueidentifier" : "TEXT", nullable: false),
                    Endpoint = table.Column<string>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "nvarchar(2048)" : "TEXT", maxLength: 2048, nullable: false),
                    EndpointHash = table.Column<string>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "nvarchar(64)" : "TEXT", maxLength: 64, nullable: false),
                    P256dh = table.Column<string>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "nvarchar(100)" : "TEXT", maxLength: 100, nullable: false),
                    Auth = table.Column<string>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "nvarchar(32)" : "TEXT", maxLength: 32, nullable: false),
                    TimeZoneId = table.Column<string>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "nvarchar(100)" : "TEXT", maxLength: 100, nullable: false),
                    OpeningReminder = table.Column<bool>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "bit" : "INTEGER", nullable: false),
                    WindDownReminder = table.Column<bool>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "bit" : "INTEGER", nullable: false),
                    LastTestAtUtc = table.Column<DateTime>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "datetime2" : "TEXT", nullable: true)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PushDevices", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PushDevices_Users_UserId",
                        column: x => x.UserId,
                        principalTable: "Users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "PushDeliveries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "uniqueidentifier" : "TEXT", nullable: false),
                    PushDeviceId = table.Column<Guid>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "uniqueidentifier" : "TEXT", nullable: false),
                    SleepDate = table.Column<string>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "nvarchar(10)" : "TEXT", maxLength: 10, nullable: false),
                    Kind = table.Column<string>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "nvarchar(16)" : "TEXT", maxLength: 16, nullable: false),
                    ClaimedAtUtc = table.Column<DateTime>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "datetime2" : "TEXT", nullable: false),
                    Completed = table.Column<bool>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "bit" : "INTEGER", nullable: false),
                    Attempts = table.Column<int>(type: ActiveProvider == "Microsoft.EntityFrameworkCore.SqlServer" ? "int" : "INTEGER", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_PushDeliveries", x => x.Id);
                    table.ForeignKey(
                        name: "FK_PushDeliveries_PushDevices_PushDeviceId",
                        column: x => x.PushDeviceId,
                        principalTable: "PushDevices",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_PushDeliveries_PushDeviceId_SleepDate_Kind",
                table: "PushDeliveries",
                columns: new[] { "PushDeviceId", "SleepDate", "Kind" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PushDevices_EndpointHash",
                table: "PushDevices",
                column: "EndpointHash",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_PushDevices_UserId",
                table: "PushDevices",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "PushDeliveries");

            migrationBuilder.DropTable(
                name: "PushDevices");
        }
    }
}
