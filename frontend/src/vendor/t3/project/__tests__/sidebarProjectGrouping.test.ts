import { describe, expect, it } from 'vitest'
import { derivePhysicalProjectKey } from '../logicalProject'
import { buildSidebarProjectSnapshots } from '../sidebarProjectGrouping'
import type { Project } from '../types'

const settings = {
  sidebarProjectGroupingMode: 'repository' as const,
  sidebarProjectGroupingOverrides: {},
}

describe('T3 copied sidebar project grouping', () => {
  it('groups roots by repository identity and preserves physical member refs', () => {
    const projects: Project[] = [
      {
        id: 'local-clawctrl',
        environmentId: 'local',
        name: 'clawctrl',
        cwd: '/Volumes/T7/projects/clawctrl',
        repositoryIdentity: {
          canonicalKey: 'github.com/josue7211/clawctrl',
          rootPath: '/Volumes/T7/projects/clawctrl',
          displayName: 'josue7211/clawctrl',
          name: 'clawctrl',
        },
      },
      {
        id: 'remote-clawctrl',
        environmentId: 'agent-vm',
        name: 'clawctrl',
        cwd: '/home/josue/projects/clawctrl',
        repositoryIdentity: {
          canonicalKey: 'github.com/josue7211/clawctrl',
          rootPath: '/home/josue/projects/clawctrl',
          displayName: 'josue7211/clawctrl',
          name: 'clawctrl',
        },
      },
    ]

    const snapshots = buildSidebarProjectSnapshots({
      projects,
      settings,
      primaryEnvironmentId: 'local',
      resolveEnvironmentLabel: environmentId => environmentId,
    })

    expect(snapshots).toHaveLength(1)
    expect(snapshots[0]).toMatchObject({
      projectKey: 'github.com/josue7211/clawctrl',
      displayName: 'josue7211/clawctrl',
      groupedProjectCount: 2,
      environmentPresence: 'mixed',
      remoteEnvironmentLabels: ['agent-vm'],
    })
    expect(snapshots[0]?.memberProjects.map(derivePhysicalProjectKey)).toEqual([
      'local:/volumes/t7/projects/clawctrl',
      'agent-vm:/home/josue/projects/clawctrl',
    ])
  })

  it('splits repository subroots in repository-path mode through T3 overrides', () => {
    const root: Project = {
      id: 'root',
      environmentId: 'local',
      name: 'clawctrl',
      cwd: '/Volumes/T7/projects/clawctrl',
      repositoryIdentity: {
        canonicalKey: 'github.com/josue7211/clawctrl',
        rootPath: '/Volumes/T7/projects/clawctrl',
        displayName: 'josue7211/clawctrl',
        name: 'clawctrl',
      },
    }
    const frontend: Project = {
      ...root,
      id: 'frontend',
      name: 'frontend',
      cwd: '/Volumes/T7/projects/clawctrl/frontend',
    }

    const snapshots = buildSidebarProjectSnapshots({
      projects: [root, frontend],
      settings: {
        sidebarProjectGroupingMode: 'repository',
        sidebarProjectGroupingOverrides: {
          [derivePhysicalProjectKey(frontend)]: 'repository-path',
        },
      },
      primaryEnvironmentId: 'local',
      resolveEnvironmentLabel: environmentId => environmentId,
    })

    expect(snapshots.map(snapshot => snapshot.projectKey)).toEqual([
      'github.com/josue7211/clawctrl',
      'github.com/josue7211/clawctrl::frontend',
    ])
  })
})
