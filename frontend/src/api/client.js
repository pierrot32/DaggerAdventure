export class ApiError extends Error {
	constructor(message, status, retryAfter) {
		super(message);
		this.name = "ApiError";
		this.status = status;
		this.retryAfter = retryAfter;
	}
}

// Shared fetch wrapper: always sends cookies and unwraps JSON error bodies
export async function request(path, options = {}) {
	const isFormData =
		typeof FormData !== "undefined" && options.body instanceof FormData;
	const response = await fetch(path, {
		...options,
		credentials: "include",
		headers: isFormData
			? options.headers
			: { "Content-Type": "application/json", ...options.headers },
	});
	const data = await response.json().catch(() => ({}));
	if (!response.ok) {
		throw new ApiError(
			data.error || "Something went wrong",
			response.status,
			response.headers.get("Retry-After"),
		);
	}
	return data;
}
