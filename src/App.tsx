/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import Editor from './components/Editor';
import { Sparkles, Menu, Plus, FileText, Trash2, X } from 'lucide-react';

export interface Project {
  id: string;
  title: string;
  content: string;
  updatedAt: number;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const savedProjects = localStorage.getItem('magic-writer-projects');
    if (savedProjects) {
      const parsed = JSON.parse(savedProjects);
      setProjects(parsed);
      if (parsed.length > 0) {
        setCurrentProjectId(parsed[0].id);
      } else {
        createNewProject();
      }
    } else {
      // Migrate old editor-content if exists
      const oldContent = localStorage.getItem('editor-content');
      if (oldContent) {
        const migratedProject: Project = {
          id: crypto.randomUUID(),
          title: 'Migrated Document',
          content: oldContent,
          updatedAt: Date.now(),
        };
        setProjects([migratedProject]);
        setCurrentProjectId(migratedProject.id);
        localStorage.setItem('magic-writer-projects', JSON.stringify([migratedProject]));
      } else {
        createNewProject();
      }
    }
    setIsReady(true);
  }, []);

  const saveProjects = (newProjects: Project[]) => {
    setProjects(newProjects);
    localStorage.setItem('magic-writer-projects', JSON.stringify(newProjects));
  };

  const createNewProject = () => {
    const newProject: Project = {
      id: crypto.randomUUID(),
      title: '',
      content: '',
      updatedAt: Date.now(),
    };
    const newProjects = [newProject, ...projects];
    saveProjects(newProjects);
    setCurrentProjectId(newProject.id);
    setIsSidebarOpen(false);
  };

  const currentProject = projects.find(p => p.id === currentProjectId);

  const updateCurrentProject = (updates: Partial<Project>) => {
    if (!currentProjectId) return;
    const newProjects = projects.map(p => 
      p.id === currentProjectId ? { ...p, ...updates, updatedAt: Date.now() } : p
    );
    saveProjects(newProjects);
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newProjects = projects.filter(p => p.id !== id);
    saveProjects(newProjects);
    if (currentProjectId === id) {
      setCurrentProjectId(newProjects.length > 0 ? newProjects[0].id : null);
      if (newProjects.length === 0) {
        createNewProject();
      }
    }
  };

  if (!isReady || !currentProject) {
    return null;
  }

  return (
    <div className="min-h-screen flex bg-[#FAFAFA] dark:bg-[#111111] text-zinc-900 dark:text-zinc-100 font-sans selection:bg-indigo-200 dark:selection:bg-indigo-900/50">
      {/* Sidebar Overlay */}
      {isSidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/20 dark:bg-black/40 z-40 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`
        fixed lg:static inset-y-0 left-0 z-50 w-64 bg-white dark:bg-[#1A1A1A] border-r border-zinc-200 dark:border-zinc-800 transform transition-transform duration-300 ease-in-out
        ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
      `}>
        <div className="h-14 flex items-center justify-between px-4 border-b border-zinc-200 dark:border-zinc-800">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-indigo-500 flex items-center justify-center shadow-sm">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold tracking-tight">Magic Writer</span>
          </div>
          <button onClick={() => setIsSidebarOpen(false)} className="lg:hidden text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100">
            <X className="w-5 h-5" />
          </button>
        </div>
        
        <div className="p-4">
          <button 
            onClick={createNewProject}
            className="w-full flex items-center justify-center gap-2 bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-4 h-4" />
            New Project
          </button>
        </div>

        <div className="px-3 pb-4 overflow-y-auto h-[calc(100vh-8rem)]">
          <div className="space-y-1">
            {projects.map(project => (
              <div 
                key={project.id}
                onClick={() => {
                  setCurrentProjectId(project.id);
                  setIsSidebarOpen(false);
                }}
                className={`
                  group flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer transition-colors
                  ${currentProjectId === project.id 
                    ? 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400' 
                    : 'hover:bg-zinc-100 dark:hover:bg-zinc-800/50 text-zinc-700 dark:text-zinc-300'}
                `}
              >
                <div className="flex items-center gap-3 overflow-hidden">
                  <FileText className="w-4 h-4 shrink-0 opacity-70" />
                  <span className="truncate text-sm font-medium">
                    {project.title || 'Untitled Document'}
                  </span>
                </div>
                <button 
                  onClick={(e) => deleteProject(project.id, e)}
                  className="opacity-0 group-hover:opacity-100 p-1 hover:bg-zinc-200 dark:hover:bg-zinc-700 rounded transition-all text-zinc-400 hover:text-rose-500"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 w-full backdrop-blur-md bg-white/70 dark:bg-[#111111]/70 border-b border-zinc-200 dark:border-zinc-800">
          <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button 
                onClick={() => setIsSidebarOpen(true)}
                className="lg:hidden p-2 -ml-2 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 rounded-lg hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
              >
                <Menu className="w-5 h-5" />
              </button>
              <span className="font-medium text-sm text-zinc-500 dark:text-zinc-400 lg:hidden">
                {currentProject.title || 'Untitled Document'}
              </span>
            </div>
            <div className="flex items-center gap-4 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <span>Draft saved</span>
              <button className="bg-zinc-900 dark:bg-white text-white dark:text-zinc-900 px-4 py-1.5 rounded-full hover:bg-zinc-800 dark:hover:bg-zinc-100 transition-colors">
                Publish
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto">
          <div className="max-w-3xl mx-auto pt-12">
            <div className="px-4 mb-8">
              <input 
                type="text" 
                value={currentProject.title}
                onChange={(e) => updateCurrentProject({ title: e.target.value })}
                placeholder="Untitled Document" 
                className="w-full text-4xl font-bold bg-transparent border-none outline-none placeholder:text-zinc-300 dark:placeholder:text-zinc-700"
              />
            </div>
            <Editor 
              key={currentProject.id}
              initialContent={currentProject.content}
              onSave={(content) => updateCurrentProject({ content })}
            />
          </div>
        </main>
      </div>
    </div>
  );
}

