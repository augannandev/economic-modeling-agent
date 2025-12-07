import { 
  Home, 
  Settings, 
  FolderOpen,
  Activity,
  FileSpreadsheet,
  BookOpen,
  Network,
} from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarGroupContent,
} from "@/components/ui/sidebar";

export function AppSidebar() {
  const location = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location.pathname === '/';
    return location.pathname.startsWith(path);
  };

  return (
    <Sidebar collapsible="icon" className="sticky top-12 h-[calc(100vh-3rem)] z-40">
      <SidebarContent className="overflow-y-auto">
        <SidebarGroup>
          <SidebarGroupLabel>Dashboard</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Home" isActive={isActive('/')} asChild>
                  <Link to="/">
                    <Home className="w-4 h-4" />
                    <span>Home</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Projects" isActive={isActive('/projects')} asChild>
                  <Link to="/projects">
                    <FolderOpen className="w-4 h-4" />
                    <span>Projects</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        <SidebarGroup>
          <SidebarGroupLabel>Analysis Tools</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="KM Digitizer" isActive={isActive('/digitizer')} asChild>
                  <Link to="/digitizer">
                    <FileSpreadsheet className="w-4 h-4" />
                    <span>KM Digitizer</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Survival Analysis" isActive={isActive('/survival-analysis')} asChild>
                  <Link to="/survival-analysis">
                    <Activity className="w-4 h-4" />
                    <span>Survival Analysis</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Literature Review" isActive={isActive('/slr')} asChild>
                  <Link to="/slr">
                    <BookOpen className="w-4 h-4" />
                    <span>Literature Review</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
              <SidebarMenuItem>
                <SidebarMenuButton tooltip="Network Meta-Analysis" isActive={isActive('/nma')} asChild>
                  <Link to="/nma">
                    <Network className="w-4 h-4" />
                    <span>NMA</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton tooltip="Settings" isActive={isActive('/settings')} asChild>
              <Link to="/settings">
                <Settings className="w-4 h-4" />
                <span>Settings</span>
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  );
}
