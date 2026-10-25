const http = require("node:http");
const fs = require("node:fs/promises");
const path = require("node:path");

const port = Number(process.env.PORT) || 3000;
const dataDirectory = path.join(__dirname, "data");
const dataFile = path.join(dataDirectory, "conversations.json");

const initialConversations = [
	{ id: 1, name: "Riya Mehta", initials: "RM", color: "", time: "10:42", unread: 2, group: false, online: true, preview: "That little cafe was perfect ☕", messages: [
		{ text: "Hey! Found that cafe you were telling me about.", time: "10:35", mine: false },
		{ text: "The one with the tiny garden out back?", time: "10:37", mine: true },
		{ text: "Yes! Their coffee is so good, and it's super quiet in the morning.", time: "10:39", mine: false },
		{ text: "That little cafe was perfect ☕", time: "10:42", mine: false }
	] },
	{ id: 2, name: "Weekend crew", initials: "WC", color: "coral", time: "09:18", unread: 0, group: true, online: false, preview: "Maya: Saturday works for me!", messages: [
		{ text: "Anyone up for a day trip this weekend?", time: "09:02", mine: false },
		{ text: "Saturday works for me!", time: "09:18", mine: false }
	] },
	{ id: 3, name: "Kabir Shah", initials: "KS", color: "blue", time: "Yesterday", unread: 0, group: false, online: false, preview: "Sent you the playlist 🎧", messages: [
		{ text: "Finally put that playlist together for you.", time: "Yesterday", mine: false },
		{ text: "Sent you the playlist 🎧", time: "Yesterday", mine: false }
	] },
	{ id: 4, name: "Design folks", initials: "DF", color: "purple", time: "Yesterday", unread: 4, group: true, online: false, preview: "You: Love this direction", messages: [
		{ text: "New boards are ready for a look.", time: "Yesterday", mine: false },
		{ text: "Love this direction", time: "Yesterday", mine: true }
	] },
	{ id: 5, name: "Anaya Kapoor", initials: "AK", color: "yellow", time: "Mon", unread: 0, group: false, online: false, preview: "Thanks again for today!", messages: [
		{ text: "Thanks again for today! That was lovely.", time: "Mon", mine: false }
	] },
	{ id: 6, name: "Arjun Verma", initials: "AV", color: "blue", time: "Mon", unread: 0, group: false, online: false, preview: "See you soon :) ", messages: [
		{ text: "See you soon :) ", time: "Mon", mine: false }
	] }
];

async function readConversations() {
	return JSON.parse(await fs.readFile(dataFile, "utf8"));
}

async function saveConversations(conversations) {
	const temporaryFile = `${dataFile}.tmp`;
	await fs.writeFile(temporaryFile, JSON.stringify(conversations, null, 2), "utf8");
	await fs.rename(temporaryFile, dataFile);
}

function sendJson(response, statusCode, body) {
	response.writeHead(statusCode, {
		"Content-Type": "application/json; charset=utf-8",
		"Cache-Control": "no-store",
		"X-Content-Type-Options": "nosniff"
	});
	response.end(JSON.stringify(body));
}

async function readJsonBody(request) {
	let body = "";
	for await (const chunk of request) {
		body += chunk;
		if (Buffer.byteLength(body) > 10_000) {
			const error = new Error("Request body is too large.");
			error.statusCode = 413;
			throw error;
		}
	}
	try {
		return JSON.parse(body);
	} catch {
		const error = new Error("Request body must contain valid JSON.");
		error.statusCode = 400;
		throw error;
	}
}

async function handleRequest(request, response) {
	const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
	if (request.method === "GET" && url.pathname === "/") {
		response.writeHead(302, { Location: "/sujal.html" });
		response.end();
		return;
	}
	if (request.method === "GET" && url.pathname === "/sujal.html") {
		try {
			const html = await fs.readFile(path.join(__dirname, "sujal.html"));
			response.writeHead(200, {
				"Content-Type": "text/html; charset=utf-8",
				"X-Content-Type-Options": "nosniff"
			});
			response.end(html);
		} catch (error) {
			console.error("Failed to serve sujal.html:", error);
			sendJson(response, 500, { error: "The chat page could not be loaded." });
		}
		return;
	}
	if (url.pathname === "/api/conversations" && request.method === "GET") {
		try {
			sendJson(response, 200, await readConversations());
		} catch (error) {
			console.error("Failed to read conversations:", error);
			sendJson(response, 500, { error: "Conversations could not be loaded." });
		}
		return;
	}

	const messageRoute = url.pathname.match(/^\/api\/conversations\/(\d+)\/messages$/);
	if (messageRoute && request.method === "POST") {
		try {
			const body = await readJsonBody(request);
			const text = body && typeof body === "object" ? body.text : undefined;
			if (typeof text !== "string" || !text.trim() || text.trim().length > 2000) {
				sendJson(response, 400, { error: "Message must be between 1 and 2000 characters." });
				return;
			}
			const conversations = await readConversations();
			const conversation = conversations.find((item) => item.id === Number(messageRoute[1]));
			if (!conversation) {
				sendJson(response, 404, { error: "Conversation not found." });
				return;
			}
			const now = new Date();
			const time = now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
			const message = { text: text.trim(), time, mine: true };
			conversation.messages.push(message);
			conversation.preview = message.text;
			conversation.time = time;
			await saveConversations(conversations);
			sendJson(response, 201, message);
		} catch (error) {
			const statusCode = error.statusCode || 500;
			if (statusCode === 500) console.error("Failed to save message:", error);
			sendJson(response, statusCode, {
				error: statusCode === 500 ? "The message could not be saved." : error.message
			});
		}
		return;
	}

	sendJson(response, 404, { error: "Route not found." });
}

async function startServer() {
	await fs.mkdir(dataDirectory, { recursive: true });
	try {
		await fs.access(dataFile);
	} catch (error) {
		if (error.code !== "ENOENT") throw error;
		await saveConversations(initialConversations);
	}

	const server = http.createServer((request, response) => {
		handleRequest(request, response).catch((error) => {
			console.error("Unexpected request error:", error);
			if (!response.headersSent) sendJson(response, 500, { error: "An unexpected server error occurred." });
			else response.destroy();
		});
	});
	server.listen(port, () => console.log(`Chatter is running at http://localhost:${port}`));
}

startServer().catch((error) => {
	console.error("Could not start Chatter:", error);
	process.exitCode = 1;
});
