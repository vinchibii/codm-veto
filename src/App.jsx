import { Crosshair } from "lucide-react";
import { Toaster } from "@/components/ui/sonner";
import { useHash, useServer } from "@/lib/hooks.js";
import { cleanCode, isCode } from "@/lib/client.js";
import { Home } from "@/pages/home.jsx";
import { Create } from "@/pages/create.jsx";
import { Room } from "@/pages/room.jsx";
import { Practice } from "@/pages/practice.jsx";

function route(hash) {
  if (hash === "new") return { page: "create" };
  if (hash === "practice") return { page: "practice" };
  const code = cleanCode(hash.replace(/\/draft$/i, ""));
  if (isCode(code)) return { page: "room", code };
  return { page: "home" };
}

export default function App() {
  const hash = useHash();
  const server = useServer();
  let { page, code } = route(hash);
  if (page === "room" && server.checked && !server.rooms) page = "home"; // preview or unconfigured server

  return (
    <div className="flex min-h-svh flex-col">
      <header className="border-b">
        <div className="container flex h-14 max-w-screen-xl items-center justify-between">
          <a href="#" className="flex items-center gap-2 text-sm font-semibold"><Crosshair className="size-4" />Map veto</a>
          {page !== "create" && page !== "room" && <a href="#new" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Create a room</a>}
        </div>
      </header>
      <main className="container max-w-screen-xl flex-1 py-4">
        {page === "home" && <Home server={server} />}
        {page === "create" && <Create server={server} />}
        {page === "practice" && <Practice />}
        {page === "room" && server.checked && <Room key={code} code={code} server={server} />}
      </main>
      <footer className="border-t">
        <div className="container flex h-12 max-w-screen-xl items-center text-xs text-muted-foreground">
          Map pool from the CODM World Championship 2026 esports settings. Fan-made, not affiliated with Activision or TiMi.
        </div>
      </footer>
      <Toaster position="top-center" />
    </div>
  );
}
