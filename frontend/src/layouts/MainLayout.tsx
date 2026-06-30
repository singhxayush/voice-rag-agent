import { Outlet } from "react-router-dom"

const MainLayout = () => {
  return (
    <div className="flex min-h-screen flex-col">
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  )
}

export default MainLayout
