import { OpenWorldGame } from "@/components/game/OpenWorldGame";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "7Being World · Game",
  description: "Open-world web game controlled by BCI / keyboard",
};

export default function GamePage() {
  return <OpenWorldGame />;
}
