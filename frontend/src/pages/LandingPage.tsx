import React from "react";
type IconName =
  | "users"
  | "terminal"
  | "folder"
  | "chat"
  | "shield"
  | "sparkles";

const features: {
  title: string;
  description: string;
  icon: IconName;
}[] = [
  {
    title: "Real-Time Collaboration",
    description: "Code together with your team with instant synchronization.",
    icon: "users",
  },
  {
    title: "Run Code Instantly",
    description: "Execute code in multiple languages directly from the editor.",
    icon: "terminal",
  },
  {
    title: "File Management",
    description: "Create, edit, and organize files in your workspace.",
    icon: "folder",
  },
  {
    title: "Chat & Notifications",
    description: "Discuss ideas without leaving the editor.",
    icon: "chat",
  },
  {
    title: "Role-Based Access",
    description: "Viewer, Editor, and Admin roles for better control.",
    icon: "shield",
  },
  {
    title: "AI Copilot",
    description: "Get smart code suggestions with AI assistance.",
    icon: "sparkles",
  },
];

const steps = [
  ["01", "Sign In", "Create an account and enter your workspace."],
  ["02", "Create / Join a Room", "Start a session or join with a room ID."],
  ["03", "Code Together", "Write, run, and collaborate in real time."],
  ["04", "Build Amazing Things", "Turn your ideas into reality, together."],
];

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: "users" | "terminal" | "folder" | "chat" | "shield" | "sparkles";
  className?: string;
}) {
  const common: React.SVGProps<SVGSVGElement> = {
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    viewBox: "0 0 24 24",
  };

  const paths = {
    users: (
      <>
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <circle cx="9.5" cy="7" r="4" />
        <path d="M17 11a4 4 0 0 0 0-8" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.87" />
      </>
    ),
    terminal: (
      <>
        <path d="m4 17 6-5-6-5" />
        <path d="M12 19h8" />
      </>
    ),
    folder: (
      <path d="M3 7.5A2.5 2.5 0 0 1 5.5 5H10l2 2h6.5A2.5 2.5 0 0 1 21 9.5v7A2.5 2.5 0 0 1 18.5 19h-13A2.5 2.5 0 0 1 3 16.5z" />
    ),
    chat: (
      <>
        <path d="M20 11.5a7.5 7.5 0 0 1-8 7.5 8.5 8.5 0 0 1-4-.9L4 20l1.4-3.3A7.2 7.2 0 0 1 4 11.5 7.5 7.5 0 0 1 12 4a7.5 7.5 0 0 1 8 7.5Z" />
        <path d="M8 11h.01M12 11h.01M16 11h.01" />
      </>
    ),
    shield: (
      <>
        <path d="M12 3 20 6v5c0 5-3.2 8.3-8 10-4.8-1.7-8-5-8-10V6z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
    sparkles: (
      <>
        <path d="m12 3 1.2 3.8L17 8l-3.8 1.2L12 13l-1.2-3.8L7 8l3.8-1.2z" />
        <path d="m19 14 .7 2.3L22 17l-2.3.7L19 20l-.7-2.3L16 17l2.3-.7z" />
        <path d="m5 14 .7 1.8L7.5 16.5l-1.8.7L5 19l-.7-1.8-1.8-.7z" />
      </>
    ),
  };

  return <svg {...common}>{paths[name]}</svg>;
}

function EditorPreview() {
  return (
    <div className="relative mx-auto w-full max-w-3xl">
      <div className="absolute -inset-5 rounded-[2rem] bg-violet-600/15 blur-3xl" />

      <div className="relative overflow-hidden rounded-2xl border border-violet-500/40 bg-[#090d17] shadow-2xl shadow-violet-950/50">
        <div className="flex h-12 items-center gap-3 border-b border-white/10 bg-[#0d1220] px-4">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-yellow-400/80" />
            <span className="h-2.5 w-2.5 rounded-full bg-green-400/80" />
          </div>

          <div className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="text-violet-400">&lt;/&gt;</span>
            CodeCollab
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="rounded-md border border-white/10 bg-white/[0.03] px-3 py-1 text-[10px] text-slate-400">
              room-7f3e
            </span>
            <span className="flex -space-x-2">
              {["D", "P", "S"].map((x, i) => (
                <span
                  key={x}
                  className={`flex h-7 w-7 items-center justify-center rounded-full border-2 border-[#090d17] text-[10px] font-bold ${
                    i === 0
                      ? "bg-violet-500"
                      : i === 1
                        ? "bg-fuchsia-500"
                        : "bg-cyan-500"
                  }`}
                >
                  {x}
                </span>
              ))}
            </span>
            <button className="rounded-md bg-violet-500 px-3 py-1.5 text-xs font-semibold text-white">
              Run
            </button>
          </div>
        </div>

        <div className="grid min-h-[310px] grid-cols-[150px_1fr_190px]">
          <aside className="border-r border-white/10 bg-[#0b101b] p-3">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
              Files
            </p>
            {["index.js", "package.json", "README.md", "style.css"].map(
              (file, i) => (
                <div
                  key={file}
                  className={`mb-1 rounded-md px-2.5 py-2 text-xs ${
                    i === 0
                      ? "bg-violet-500/15 text-violet-300"
                      : "text-slate-500"
                  }`}
                >
                  {file}
                </div>
              )
            )}
            <button className="mt-2 w-full rounded-md border border-dashed border-white/10 py-2 text-[10px] text-slate-500">
              + New File
            </button>
          </aside>

          <div className="overflow-hidden">
            <div className="border-b border-white/10 px-4 py-2 text-[10px] text-slate-500">
              index.js
            </div>
            <pre className="p-4 font-mono text-[11px] leading-6 text-slate-400">
              <span className="text-slate-600">1</span>{"  "}
              <span className="text-green-400">// Welcome to CodeCollab!</span>
              {"\n"}
              <span className="text-slate-600">2</span>
              {"\n"}
              <span className="text-slate-600">3</span>{"  "}
              <span className="text-violet-300">function</span>{" "}
              <span className="text-cyan-300">greet</span>() {"{"}
              {"\n"}
              <span className="text-slate-600">4</span>{"     "}
              <span className="text-violet-300">console</span>.log(
              <span className="text-orange-300">
                "Hello, Collaborators!"
              </span>
              );
              {"\n"}
              <span className="text-slate-600">5</span>{"  "}
              {"}"}
              {"\n"}
              <span className="text-slate-600">6</span>
              {"\n"}
              <span className="text-slate-600">7</span>{"  "}
              <span className="text-cyan-300">greet</span>();
            </pre>
          </div>

          <aside className="border-l border-white/10 bg-[#0b101b]">
            <div className="border-b border-white/10 px-3 py-2 text-[10px] font-semibold text-slate-500">
              Output
            </div>
            <div className="p-3 font-mono text-[10px] text-green-400">
              Hello, Collaborators!
            </div>
            <div className="border-y border-white/10 px-3 py-2 text-[10px] font-semibold text-slate-500">
              Chat
            </div>
            <div className="space-y-3 p-3 text-[9px]">
              <div>
                <span className="font-semibold text-violet-300">Dhanush</span>
                <p className="mt-1 text-slate-500">Looks good!</p>
              </div>
              <div>
                <span className="font-semibold text-cyan-300">Priya</span>
                <p className="mt-1 text-slate-500">Shall we add a function?</p>
              </div>
              <div>
                <span className="font-semibold text-fuchsia-300">Sarthak</span>
                <p className="mt-1 text-slate-500">Yeah, let's do it!</p>
              </div>
            </div>
          </aside>
        </div>

        <div className="flex flex-wrap gap-x-5 gap-y-2 border-t border-white/10 px-4 py-3 text-[9px] text-slate-500">
          <span className="text-emerald-400">● 3 users online</span>
          <span>↻ Real-time sync</span>
          <span>▷ Code execution</span>
          <span>◯ Built-in chat</span>
          <span>◇ Whiteboard</span>
        </div>
      </div>
    </div>
  );
}

export default function LandingPage() {
  // Change these paths if your project uses different route names.
  const goToLogin = () => {
    window.location.href = "/login";
  };

  const goToSignup = () => {
    window.location.href = "/signup";
  };

  return (
    <main className="min-h-screen overflow-x-hidden bg-[#070a12] text-white">
      {/* Background */}
      <div className="pointer-events-none fixed inset-0 -z-10">
        <div className="absolute left-1/4 top-0 h-[500px] w-[500px] rounded-full bg-violet-700/10 blur-[140px]" />
        <div className="absolute right-0 top-1/3 h-[450px] w-[450px] rounded-full bg-blue-600/10 blur-[140px]" />
        <div className="absolute inset-0 opacity-[0.025] [background-image:linear-gradient(rgba(255,255,255,.8)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,.8)_1px,transparent_1px)] [background-size:55px_55px]" />
      </div>

      {/* Navbar */}
      <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5 lg:px-8">
        <a href="/" className="flex items-center gap-3">
          <span className="text-2xl font-black text-violet-400">&lt;/&gt;</span>
          <span className="text-xl font-bold tracking-tight">
            Code<span className="text-violet-400">Collab</span>
          </span>
        </a>

        <div className="hidden items-center gap-8 text-sm text-slate-400 md:flex">
          <a href="#features" className="transition hover:text-white">
            Features
          </a>
          <a href="#how-it-works" className="transition hover:text-white">
            How It Works
          </a>
          <a href="#tech-stack" className="transition hover:text-white">
            Tech Stack
          </a>
          <a href="#about" className="transition hover:text-white">
            About
          </a>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={goToLogin}
            className="hidden px-3 py-2 text-sm text-slate-300 transition hover:text-white sm:block"
          >
            Sign In
          </button>
          <button
            onClick={goToSignup}
            className="rounded-lg bg-violet-500 px-5 py-2.5 text-sm font-semibold shadow-lg shadow-violet-500/20 transition hover:bg-violet-400"
          >
            Get Started
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="mx-auto grid max-w-7xl items-center gap-12 px-5 pb-20 pt-12 lg:grid-cols-[0.9fr_1.1fr] lg:px-8 lg:pb-28 lg:pt-20">
        <div>
          <div className="mb-6 inline-flex rounded-full border border-violet-400/20 bg-violet-500/10 px-4 py-2 text-xs font-medium text-violet-300">
            Code Together. Build Better.
          </div>

          <h1 className="max-w-xl text-5xl font-black leading-[1.02] tracking-tight sm:text-6xl lg:text-7xl">
            Real-Time
            <br />
            <span className="bg-gradient-to-r from-white via-violet-200 to-violet-500 bg-clip-text text-transparent">
              Collaborative
            </span>
            <br />
            Code Editor
          </h1>

          <p className="mt-7 max-w-xl text-base leading-7 text-slate-400 sm:text-lg">
            Write, run, and collaborate on code with your team — in real time.
            CodeCollab makes pair programming, learning, and building together
            simple, fast, and powerful.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row">
            <button
              onClick={goToSignup}
              className="rounded-xl bg-violet-500 px-7 py-3.5 text-sm font-bold shadow-xl shadow-violet-500/20 transition hover:-translate-y-0.5 hover:bg-violet-400"
            >
              Get Started for Free →
            </button>
            <a
              href="https://github.com/Dhanush299/CodeCollab-Real-Time-Collaborative-Code-Editor"
              target="_blank"
              rel="noreferrer"
              className="rounded-xl border border-violet-400/40 px-7 py-3.5 text-center text-sm font-semibold text-slate-200 transition hover:bg-violet-500/10"
            >
              View on GitHub
            </a>
          </div>

          <div className="mt-7 flex flex-wrap gap-x-6 gap-y-3 text-xs text-slate-500">
            <span>✓ No setup required</span>
            <span>✓ Real-time collaboration</span>
            <span>✓ Multi-language support</span>
          </div>
        </div>

        <EditorPreview />
      </section>

      {/* Features */}
      <section id="features" className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto grid max-w-7xl grid-cols-2 px-5 py-16 sm:grid-cols-3 lg:px-8">
          {features.map((feature) => (
            <div
              key={feature.title}
              className="border-white/10 px-5 py-7 text-center sm:border-r last:border-r-0"
            >
              <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl border border-violet-400/20 bg-violet-500/10 text-violet-300">
                <Icon name={feature.icon} className="h-5 w-5" />
              </div>
              <h3 className="text-sm font-bold">{feature.title}</h3>
              <p className="mx-auto mt-2 max-w-[190px] text-xs leading-5 text-slate-500">
                {feature.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="mx-auto max-w-7xl px-5 py-24 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-400">
            Simple workflow
          </p>
          <h2 className="mt-3 text-4xl font-bold tracking-tight">
            How It Works
          </h2>
          <p className="mt-4 text-slate-500">
            Get started in seconds and collaborate seamlessly.
          </p>
        </div>

        <div className="mt-16 grid gap-10 md:grid-cols-4">
          {steps.map(([number, title, description], index) => (
            <div key={number} className="relative text-center">
              {index !== steps.length - 1 && (
                <div className="absolute left-[60%] top-6 hidden w-[80%] border-t border-dashed border-violet-500/20 md:block" />
              )}
              <div className="relative mx-auto flex h-14 w-14 items-center justify-center rounded-full border border-violet-400/50 bg-[#0b1020] text-sm font-bold text-violet-300 shadow-lg shadow-violet-950/40">
                {number}
              </div>
              <h3 className="mt-5 font-bold">{title}</h3>
              <p className="mx-auto mt-2 max-w-[220px] text-sm leading-6 text-slate-500">
                {description}
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Tech stack */}
      <section id="tech-stack" className="border-y border-white/5 bg-white/[0.015]">
        <div className="mx-auto max-w-7xl px-5 py-20 text-center lg:px-8">
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-violet-400">
            Built for developers
          </p>
          <h2 className="mt-3 text-3xl font-bold">Powered by Modern Tech</h2>

          <div className="mt-10 flex flex-wrap justify-center gap-3">
            {[
              "React",
              "Node.js",
              "Express",
              "MongoDB",
              "Socket.IO",
              "Monaco Editor",
              "Tailwind CSS",
              "JWT",
            ].map((tech) => (
              <span
                key={tech}
                className="rounded-full border border-white/10 bg-white/[0.03] px-5 py-2.5 text-sm text-slate-400 transition hover:border-violet-400/30 hover:text-violet-300"
              >
                {tech}
              </span>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section id="about" className="mx-auto max-w-7xl px-5 py-20 lg:px-8">
        <div className="relative overflow-hidden rounded-3xl border border-violet-400/20 bg-gradient-to-r from-violet-700 to-indigo-600 p-8 shadow-2xl shadow-violet-950/30 sm:p-12">
          <div className="absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" />
          <div className="relative flex flex-col items-start justify-between gap-8 md:flex-row md:items-center">
            <div>
              <h2 className="text-3xl font-bold sm:text-4xl">
                Ready to code together?
              </h2>
              <p className="mt-3 max-w-xl text-sm leading-6 text-violet-100/80">
                Start a collaborative coding session and build something great
                with your team.
              </p>
            </div>

            <button
              onClick={goToSignup}
              className="shrink-0 rounded-xl bg-white px-6 py-3.5 text-sm font-bold text-violet-700 shadow-xl transition hover:-translate-y-0.5"
            >
              Get Started Now →
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/5">
        <div className="mx-auto flex max-w-7xl flex-col gap-6 px-5 py-8 text-sm text-slate-500 sm:flex-row sm:items-center sm:justify-between lg:px-8">
          <div>
            <div className="font-bold text-white">
              Code<span className="text-violet-400">Collab</span>
            </div>
            <p className="mt-1 text-xs">Code Together. Build Better.</p>
          </div>

          <div className="flex gap-6">
            <a
              href="https://github.com/Dhanush299/CodeCollab-Real-Time-Collaborative-Code-Editor"
              target="_blank"
              rel="noreferrer"
              className="transition hover:text-white"
            >
              GitHub
            </a>
            <a href="#features" className="transition hover:text-white">
              Features
            </a>
            <a href="#how-it-works" className="transition hover:text-white">
              How It Works
            </a>
          </div>

          <p className="text-xs">Built by Dhanush</p>
        </div>
      </footer>
    </main>
  );
}
