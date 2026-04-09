import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center p-4">
      <div className="max-w-md text-center">
        <h1 className="mb-2 text-6xl font-bold text-gray-300">404</h1>
        <h2 className="mb-4 text-2xl font-semibold text-gray-700">
          Page not found
        </h2>
        <p className="mb-6 text-gray-500">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
        <Link
          href="/"
          className="inline-block rounded-md bg-blue-600 px-6 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700"
        >
          Go back home
        </Link>
      </div>
    </div>
  );
}
