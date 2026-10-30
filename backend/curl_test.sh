TOKEN=$(curl -s -X POST http://localhost:5125/api/Auth/register -H "Content-Type: application/json" -d '{"email":"test1@test.com","password":"Password12!","nickname":"test1"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
if [ -z "$TOKEN" ]; then
    TOKEN=$(curl -s -X POST http://localhost:5125/api/Auth/login -H "Content-Type: application/json" -d '{"email":"test1@test.com","password":"Password12!"}' | grep -o '"token":"[^"]*"' | cut -d'"' -f4)
fi
echo "TOKEN=$TOKEN"
curl -s -X PUT http://localhost:5125/api/settings/me -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"nickname":"test1","cutoffTime":"23:30","localDate":"2026-07-03","localTime":"20:00"}'
curl -s -X POST http://localhost:5125/api/CheckIns -H "Authorization: Bearer $TOKEN" -H "Content-Type: application/json" -d '{"localDate":"2026-07-03","localTime":"21:30"}'
