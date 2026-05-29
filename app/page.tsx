import OmnipulsClient from "@/app/omnipuls-client";
import { getState } from "@/lib/db";

export const dynamic = "force-dynamic";

export default async function Home() {
  const state = await getState();
  return <OmnipulsClient initialState={state} />;
}
