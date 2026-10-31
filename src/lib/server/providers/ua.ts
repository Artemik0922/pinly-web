// Внешние API просят представиться: Wikimedia отдаёт 429 без User-Agent,
// а анонимный Node-запрос неотличим от сканера.

export const UA = { "User-Agent": "Pinly/1.0 (local demo)" };
