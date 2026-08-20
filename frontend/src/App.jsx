import { BrowserRouter } from "react-router-dom";
import { useEffect } from "react";
import { useAuthStore } from "./store/authStore";
import AppRoutes from "./routes/AppRoutes";

// App shell: mounts the router and kicks off the initial session check once
export default function App() {
	const loadSession = useAuthStore((state) => state.loadSession);

	useEffect(() => {
		loadSession();
	}, [loadSession]);

	return (
		<BrowserRouter>
			<AppRoutes />
		</BrowserRouter>
	);
}
