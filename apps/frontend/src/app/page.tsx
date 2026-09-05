import Link from 'next/link';

export default function Home() {
  return (
    <section className="flex min-h-[70vh] flex-col justify-center">
      <p className="text-sm font-semibold uppercase tracking-widest text-blue-700">Ready to clone and deploy</p>
      <h1 className="mt-5 max-w-4xl text-5xl font-semibold tracking-tight text-slate-950 sm:text-7xl">A production-shaped starting point for your next project.</h1>
      <p className="mt-6 max-w-2xl text-lg leading-8 text-slate-600">Next.js, Hono, Prisma, PostgreSQL, Better Auth, Docker Compose, GitHub Actions, and Coolify—all wired together.</p>
      <div className="mt-9 flex gap-3">
        <Link className="rounded-lg bg-slate-950 px-5 py-3 font-semibold text-white hover:bg-slate-700" href="/sign-up">Create account</Link>
        <Link className="rounded-lg border border-slate-300 bg-white px-5 py-3 font-semibold hover:bg-slate-100" href="/sign-in">Sign in</Link>
      </div>
    </section>
  );
}
