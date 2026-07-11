import { useEffect, useState } from "react";
import { Provider } from "react-redux";
import { useNavigate } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import store from "@/ludo/store";
// @ts-expect-error - plain JS module
import HomePage from "@/ludo/containers/HomePage";
// @ts-expect-error - plain JS module
import GamePlay from "@/ludo/containers/GamePlay";
import "bootstrap/dist/css/bootstrap.min.css";
import "toastr/build/toastr.min.css";
import "@/ludo/mystyles.css";

export default function Ludo() {
  const nav = useNavigate();
  const [started, setStarted] = useState(false);

  useEffect(() => {
    // Ensure toastr is configured
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const t = require("toastr");
    t.options = { positionClass: "toast-top-right", timeOut: 2500 };
  }, []);

  return (
    <Provider store={store}>
      <div className="min-h-screen bg-white text-black">
        <div className="flex items-center gap-2 p-2 bg-slate-900 text-white">
          <Button variant="ghost" size="icon" onClick={() => nav("/")} className="text-white">
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <h1 className="font-bold text-lg">Ludo</h1>
        </div>
        {started ? <GamePlay /> : <HomePage onStart={() => setStarted(true)} />}
      </div>
    </Provider>
  );
}