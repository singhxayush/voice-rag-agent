import { Link } from "react-router-dom"

const navigationData = [
  { name: "Home", href: "/" },
  { name: "State Hooks", href: "/state-hooks" },
  { name: "Context Hooks", href: "/context-hooks" },
  { name: "Performance Hooks", href: "/performance-hooks" },
]

const Navbar = () => {
  return (
    <nav className="bg-background p-4">
      <div className="mx-auto grid max-w-4xl grid-cols-2 gap-2 sm:grid-cols-4">
        {navigationData.map((item) => (
          <Link
            key={item.href}
            to={item.href}
            className="flex aspect-square items-center justify-center border border-neutral-200 p-2 text-center text-sm font-medium transition-colors hover:bg-neutral-50"
          >
            {item.name}
          </Link>
        ))}
      </div>
    </nav>
  )
}

export default Navbar
