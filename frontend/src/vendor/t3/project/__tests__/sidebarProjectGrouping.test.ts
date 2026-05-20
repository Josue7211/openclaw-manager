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
        id: 'local-clawcontrol',
        environmentId: 'local',
        name: 'clawcontrol',
        cwd: '/Volumes/T7/projects/clawcontrol',
        repositoryIdentity: {
          canonicalKey: 'github.com/josue7211/clawcontrol',
          rootPath: '/Volumes/T7/projects/clawcontrol',
          displayName: 'josue7211/clawcontrol',
          name: 'clawcontrol',
        },
      },
      {
        id: 'remote-clawcontrol',
        environmentId: 'agent-vm',
        name: 'clawcontrol',
        cwd: '/home/josue/projects/clawcontrol',
        repositoryIdentity: {
          canonicalKey: 'github.com/josue7211/clawcontrol',
          rootPath: '/home/josue/projects/clawcontrol',
          displayName: 'josue7211/clawcontrol',
          name: 'clawcontrol',
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
      projectKey: 'github.com/josue7211/clawcontrol',
      displayName: 'josue7211/clawcontrol',
      groupedProjectCount: 2,
      environmentPresence: 'mixed',
      remoteEnvironmentLabels: ['agent-vm'],
    })
    expect(snapshots[0]?.memberProjects.map(derivePhysicalProjectKey)).toEqual([
      'local:/volumes/t7/projects/clawcontrol',
      'agent-vm:/home/josue/projects/clawcontrol',
    ])
  })

  it('splits repository subroots in repository-path mode through T3 overrides', () => {
    const root: Project = {
      id: 'root',
      environmentId: 'local',
      name: 'clawcontrol',
      cwd: '/Volumes/T7/projects/clawcontrol',
      repositoryIdentity: {
        canonicalKey: 'github.com/josue7211/clawcontrol',
        rootPath: '/Volumes/T7/projects/clawcontrol',
        displayName: 'josue7211/clawcontrol',
        name: 'clawcontrol',
      },
    }
    const frontend: Project = {
      ...root,
      id: 'frontend',
      name: 'frontend',
      cwd: '/Volumes/T7/projects/clawcontrol/frontend',
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
      'github.com/josue7211/clawcontrol',
      'github.com/josue7211/clawcontrol::frontend',
    ])
  })
})
