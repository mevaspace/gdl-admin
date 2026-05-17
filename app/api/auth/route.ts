import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { signToken } from "@/lib/auth";

interface ValidUser {
  username: string;
  passwordHash: string;
}

export async function POST(req: NextRequest) {
  const { username, password } = await req.json();

  if (!username || !password) {
    return NextResponse.json({ error: "Username dan password wajib diisi" }, { status: 400 });
  }

  let users: ValidUser[] = [];
  try {
    const raw = Buffer.from(process.env.VALID_USERS_B64 || "", "base64").toString("utf-8");
    users = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "Konfigurasi server error" }, { status: 500 });
  }

  const user = users.find((u) => u.username === username);
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    return NextResponse.json({ error: "Username atau password salah" }, { status: 401 });
  }

  const token = await signToken(username);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("token", token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return res;

}

export async function DELETE() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete("token");
  return res;
}
