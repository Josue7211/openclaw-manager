import { describe, expect, it } from 'vitest'
import {
  buildVaultPluginCommandContributions,
  buildVaultPluginDataRecords,
  buildVaultPluginDataStore,
  buildVaultPluginWriteRecords,
  buildVaultPluginRegistry,
  buildVaultPluginMarketplacePackages,
  buildVaultPluginTrustedPublishers,
  fetchVaultPluginMarketplaceFeed,
  installedVaultPlugins,
  parseVaultPluginConfig,
  parseVaultPluginDataBlocks,
  parseVaultPluginWriteBlocks,
  parseVaultPluginMarketplaceFeed,
  parseVaultPluginManifests,
  parseVaultPluginPackages,
  parseVaultPluginTrustedPublishers,
  planVaultPluginWriteApply,
  removeAppliedVaultPluginWriteBlocks,
  renderVaultPluginBlocks,
  runVaultPluginRuntime,
  vaultPluginDataMarkdown,
  vaultPluginWriteMarkdown,
  vaultPluginPackageSigningPayload,
  vaultPluginMarketplacePackagesMarkdown,
  vaultPluginPublicKeyId,
  vaultPluginManifestChecksum,
  verifyVaultPluginMarketplacePackageSignature,
} from '../vaultPlugins'
import type { VaultNote } from '../types'

function note(overrides: Partial<VaultNote>): VaultNote {
  return {
    _id: 'note.md',
    type: 'note',
    title: 'Note',
    content: '',
    folder: '',
    tags: [],
    links: [],
    aliases: [],
    properties: {},
    created_at: 1,
    updated_at: 1,
    ...overrides,
  }
}

const notes = [
  note({
    _id: 'Projects/roadmap.md',
    title: 'Roadmap',
    folder: 'Projects',
    tags: ['strategy', 'planning'],
    content: '- [x] Draft\n- [ ] Review',
    updated_at: 20,
  }),
  note({
    _id: 'Inbox/idea.md',
    title: 'Idea',
    folder: 'Inbox',
    tags: ['planning'],
    updated_at: 30,
  }),
  note({
    _id: 'Trash/old.md',
    title: 'Old',
    folder: 'Trash/Archive',
    tags: ['archive'],
    trashed_at: 40,
    updated_at: 10,
  }),
]

function base64UrlEncode(data: ArrayBuffer): string {
  const bytes = new Uint8Array(data)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

describe('local vault plugin blocks', () => {
  it('parses structured plugin config', () => {
    expect(parseVaultPluginConfig('{"plugin":"vault.recent","limit":2,"query":"tag:planning"}')).toEqual({
      plugin: 'vault.recent',
      limit: 2,
      query: 'tag:planning',
      title: undefined,
      includeDisabled: false,
    })
  })

  it('renders local stats without remote data', () => {
    const markdown = ['```claw-plugin', '{"plugin":"vault.stats","title":"Local dashboard"}', '```'].join('\n')

    const rendered = renderVaultPluginBlocks(markdown, notes)

    expect(rendered).toContain('### Local dashboard')
    expect(rendered).toContain('| Notes | 2 |')
    expect(rendered).toContain('| Tasks | 1/2 |')
    expect(rendered).toContain('| Trash | 1 |')
  })

  it('renders recent notes and excludes the current note', () => {
    const markdown = ['```claw-plugin', '{"plugin":"vault.recent","limit":5}', '```'].join('\n')

    const rendered = renderVaultPluginBlocks(markdown, notes, 'Inbox/idea.md')

    expect(rendered).toContain('[[Projects/roadmap.md|Roadmap]]')
    expect(rendered).not.toContain('Inbox/idea.md')
    expect(rendered).not.toContain('Trash/old.md')
  })

  it('renders tag counts from live notes only', () => {
    const markdown = ['```claw-plugin', '{"plugin":"vault.tags"}', '```'].join('\n')

    const rendered = renderVaultPluginBlocks(markdown, notes)

    expect(rendered).toContain('#planning (2)')
    expect(rendered).toContain('#strategy (1)')
    expect(rendered).not.toContain('#archive')
  })

  it('installs safe local template plugins from vault manifests', () => {
    const manifest = [
      '```claw-plugin-manifest',
      JSON.stringify({
        id: 'local.dashboard',
        label: 'Dashboard',
        description: 'Local template dashboard',
        permissions: ['read:vault-stats', 'read:recent-notes'],
        template: '### {{title}}\nNotes: {{noteCount}}\n{{recentList}}',
      }),
      '```',
    ].join('\n')
    const pluginNotes = [...notes, note({ _id: 'Plugins/dashboard.md', title: 'Dashboard plugin', content: manifest })]

    expect(parseVaultPluginManifests(manifest)).toEqual([
      expect.objectContaining({ id: 'local.dashboard', label: 'Dashboard' }),
    ])
    expect(installedVaultPlugins(pluginNotes).some(plugin => plugin.id === 'local.dashboard')).toBe(true)

    const rendered = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"local.dashboard","title":"Private dashboard","limit":1}', '```'].join('\n'),
      pluginNotes,
    )

    expect(rendered).toContain('### Private dashboard')
    expect(rendered).toContain('Notes: 3')
    expect(rendered).toContain('[[Inbox/idea.md|Idea]]')
    expect(rendered).not.toContain('Trash/old.md')
  })

  it('requires explicit permissions before template plugins can read vault data', () => {
    const manifest = [
      '```claw-plugin-manifest',
      JSON.stringify({
        id: 'local.private',
        label: 'Private',
        description: 'Template without data permissions',
        permissions: ['read:unknown', 'read:tags'],
        template: 'Notes: {{noteCount}}\nTags:\n{{tagList}}\nRecent:\n{{recentList}}',
      }),
      '```',
    ].join('\n')
    const pluginNotes = [...notes, note({ _id: 'Plugins/private.md', title: 'Private plugin', content: manifest })]

    expect(parseVaultPluginManifests(manifest)).toEqual([
      expect.objectContaining({ permissions: ['read:tags'] }),
    ])

    const rendered = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"local.private","limit":1}', '```'].join('\n'),
      pluginNotes,
    )

    expect(rendered).toContain('[missing permission: read:vault-stats]')
    expect(rendered).toContain('[missing permission: read:recent-notes]')
    expect(rendered).toContain('#planning (2)')
    expect(rendered).not.toContain('[[Inbox/idea.md|Idea]]')
  })

  it('exposes enabled manifest commands for the Notes command palette', () => {
    const enabledManifest = [
      '```claw-plugin-manifest',
      JSON.stringify({
        id: 'local.commands',
        label: 'Commands',
        description: 'Adds command palette actions',
        permissions: ['read:recent-notes'],
        template: '{{recentList}}',
        commands: [
          {
            id: 'daily-dashboard',
            name: 'Insert daily dashboard',
            description: 'Insert a filtered local dashboard',
            config: { title: 'Daily dashboard', query: 'tag:planning', limit: 2 },
          },
          {
            id: 'bad command id',
            name: 'Rejected',
            config: { title: 'Rejected' },
          },
        ],
      }),
      '```',
    ].join('\n')
    const disabledManifest = [
      '```claw-plugin-manifest',
      JSON.stringify({
        id: 'local.disabledcommands',
        label: 'Disabled Commands',
        description: 'Hidden from command palette',
        enabled: false,
        permissions: ['read:vault-stats'],
        template: 'Notes: {{noteCount}}',
        commands: [{ id: 'hidden', name: 'Hidden command' }],
      }),
      '```',
    ].join('\n')
    const pluginNotes = [
      ...notes,
      note({ _id: 'Plugins/commands.md', title: 'Commands plugin', content: enabledManifest }),
      note({ _id: 'Plugins/disabledcommands.md', title: 'Disabled Commands plugin', content: disabledManifest }),
    ]

    expect(parseVaultPluginManifests(enabledManifest)).toEqual([
      expect.objectContaining({
        id: 'local.commands',
        commands: [
          expect.objectContaining({
            id: 'daily-dashboard',
            name: 'Insert daily dashboard',
            config: { title: 'Daily dashboard', query: 'tag:planning', limit: 2 },
          }),
        ],
      }),
    ])
    expect(buildVaultPluginCommandContributions(pluginNotes)).toEqual([
      {
        id: 'vault-plugin-command:local.commands:daily-dashboard',
        pluginId: 'local.commands',
        pluginLabel: 'Commands',
        label: 'Insert daily dashboard',
        detail: 'Insert a filtered local dashboard',
        config: {
          plugin: 'local.commands',
          title: 'Daily dashboard',
          query: 'tag:planning',
          limit: 2,
        },
      },
    ])
  })

  it('runs permission-scoped local plugin runtime code', () => {
    const manifest = [
      '```claw-plugin-manifest',
      JSON.stringify({
        id: 'local.runtime',
        label: 'Runtime dashboard',
        description: 'Local runtime plugin',
        permissions: ['read:vault-stats', 'read:recent-notes', 'read:tags'],
        runtime: {
          language: 'claw-script',
          code: "return heading(title) + '\\n' + metricTable([['Notes', stats.noteCount], ['Tags', stats.tagCount]]) + '\\n' + recentList() + '\\n' + tagList()",
        },
      }),
      '```',
    ].join('\n')
    const pluginNotes = [...notes, note({ _id: 'Plugins/runtime.md', title: 'Runtime plugin', content: manifest })]

    const rendered = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"local.runtime","title":"Runtime","limit":1}', '```'].join('\n'),
      pluginNotes,
    )

    expect(rendered).toContain('### Runtime')
    expect(rendered).toContain('| Notes | 3 |')
    expect(rendered).toContain('[[Inbox/idea.md|Idea]]')
    expect(rendered).toContain('#planning (2)')
  })

  it('blocks local plugin runtime code that tries browser or network access', () => {
    const [plugin] = parseVaultPluginManifests(
      [
        '```claw-plugin-manifest',
        JSON.stringify({
          id: 'local.bad',
          label: 'Bad runtime',
          description: 'Unsafe runtime plugin',
          permissions: ['read:vault-stats'],
          runtime: {
            language: 'claw-script',
            code: "return fetch('https://example.com')",
          },
        }),
        '```',
      ].join('\n'),
    )

    expect(runVaultPluginRuntime(notes, { plugin: 'local.bad' }, plugin)).toEqual({
      ok: false,
      error: 'blocked token "fetch"',
    })
  })

  it('withholds runtime data when permissions are missing', () => {
    const [plugin] = parseVaultPluginManifests(
      [
        '```claw-plugin-manifest',
        JSON.stringify({
          id: 'local.limited',
          label: 'Limited runtime',
          description: 'Runtime plugin without stats permission',
          permissions: ['read:tags'],
          runtime: {
            language: 'claw-script',
            code: "return String(stats) + '\\n' + tagList() + '\\nRecent:' + recent.length",
          },
        }),
        '```',
      ].join('\n'),
    )

    const result = runVaultPluginRuntime(notes, { plugin: 'local.limited' }, plugin)

    expect(result).toEqual({ ok: true, markdown: expect.stringContaining('null\n- #planning (2)') })
    expect(result).toEqual({ ok: true, markdown: expect.stringContaining('\nRecent:0') })
  })

  it('exposes a permission-scoped Obsidian-style app facade to local runtimes', () => {
    const [plugin] = parseVaultPluginManifests(
      [
        '```claw-plugin-manifest',
        JSON.stringify({
          id: 'local.obsidian',
          label: 'Obsidian adapter',
          description: 'Uses app.vault and app.metadataCache safely',
          permissions: ['read:files', 'read:current-note', 'read:metadata', 'read:vault-stats'],
          commands: [
            {
              id: 'show-dashboard',
              name: 'Show dashboard',
              config: { title: 'Command dashboard', limit: 1 },
            },
          ],
          runtime: {
            language: 'claw-script',
            code: [
              'const active = app.workspace.getActiveFile()',
              "const notice = new Notice('Saved', 1200)",
              'notice.hide()',
              "const obsidianTokens = notice.message + ':' + notice.timeout + ':' + Platform.isDesktopApp + ':' + normalizePath('/Projects//roadmap.md')",
              "class RuntimePlugin extends Plugin { onload() { this.addCommand({ id: 'runtime', name: 'Runtime' }); return this.manifest.id + ':' + (this instanceof Component) } }",
              "const runtimePlugin = new RuntimePlugin(app, { id: 'local.obsidian' })",
              "const classTokens = runtimePlugin.onload() + ':' + new Setting(null).setName('Sync').setDesc('Safe').name + ':' + MarkdownRenderer.renderMarkdown('**Bold**')",
              "let textSeen = 'cold'; const textComponent = new TextComponent(null).setPlaceholder('Title').setValue('Draft').onChange(value => { textSeen = value }).triggerChange('Final')",
              "let toggleSeen = false; const toggleComponent = new ToggleComponent(null).setValue(false).onChange(value => { toggleSeen = value }).triggerChange(true)",
              "let dropdownSeen = 'cold'; const dropdownComponent = new DropdownComponent(null).addOptions({ alpha: 'Alpha' }).setValue('alpha').onChange(value => { dropdownSeen = value }).triggerChange('beta')",
              "let buttonSeen = 'cold'; const buttonComponent = new ButtonComponent(null).setButtonText('Save').setIcon('check').setTooltip('Save note').setCta().onClick(() => { buttonSeen = 'clicked' }).trigger()",
              "const rendererEl = { text: '', setText(value) { this.text = value; return this } }; const renderText = MarkdownRenderer.render(app, '_Render_', rendererEl, active.path, runtimePlugin)",
              "const componentTokens = [textComponent instanceof TextComponent, textComponent.placeholder, textComponent.getValue(), textSeen, toggleComponent instanceof ToggleComponent, toggleComponent.getValue(), toggleSeen, dropdownComponent instanceof DropdownComponent, Object.keys(dropdownComponent.options).join(','), dropdownSeen, buttonComponent instanceof ButtonComponent, buttonComponent.buttonText, buttonComponent.icon, buttonComponent.tooltip, buttonComponent.cta, buttonSeen, new TextAreaComponent(null) instanceof TextAreaComponent, new SearchComponent(null) instanceof SearchComponent, new ExtraButtonComponent(null).setIcon('bolt') instanceof ExtraButtonComponent, renderText, rendererEl.text].join(':')",
              "let settingClicked = 'cold'",
              "new Setting(null).addTextArea(text => text.setValue('body').onChange(() => {})).addSearch(search => search.setValue('query')).addDropdown(dropdown => dropdown.addOption('a', 'Alpha').addOptions({ b: 'Beta' }).setValue('b')).addButton(button => button.setButtonText('Run').setIcon('play').setCta().onClick(() => { settingClicked = 'yes' }).trigger()).addExtraButton(button => button.setIcon('plus').setTooltip('More'))",
              "let modalState = 'cold'",
              "class RuntimeModal extends Modal { onOpen() { modalState = 'open' } onClose() { modalState = modalState + ':closed' } }",
              "const modal = new RuntimeModal(app).setTitle('Picker').open().close()",
              "let picked = 'none'",
              "class RuntimeSuggest extends FuzzySuggestModal { getItems() { return ['Alpha'] } getItemText(item) { return item } onChooseItem(item) { picked = item } }",
              "const suggest = new RuntimeSuggest(app).setPlaceholder('Find').setInstructions([{ command: 'enter', purpose: 'open' }]).open().triggerChoose().close()",
              "const uiTokens = [settingClicked, modal.title, modalState, modal instanceof Modal, picked, suggest.placeholder, suggest.instructions.length, suggest instanceof FuzzySuggestModal].join(':')",
              "const domRef = runtimePlugin.registerDomEvent(null, 'click', () => {})",
              "const extensionRef = runtimePlugin.registerExtensions(['frontmatter'], 'markdown')",
              "const editorRef = runtimePlugin.registerEditorExtension('decorations')",
              "const viewRef = runtimePlugin.registerView('markdown', () => {})",
              "const statusItem = runtimePlugin.addStatusBarItem().setText('Ready').addClass('ok')",
              "const pluginRefs = [domRef.type, extensionRef.viewType, editorRef.viewType, viewRef.type, statusItem.text, statusItem.classes[0]].join(':')",
              "let menuState = 'cold'",
              "const menu = new Menu().addItem(item => item.setTitle('Open').setIcon('file').setChecked(true).onClick(() => { menuState = 'clicked' })).addSeparator().showAtPosition({ x: 3, y: 4 })",
              'menu.items[0].trigger()',
              "const menuTokens = [menu.items[0].title, menu.items[0] instanceof MenuItem, menu.items.length, menu.shown, menu.position.x + ',' + menu.position.y, menuState, menu.hide().shown].join(':')",
              'const first = app.vault.getMarkdownFiles()[0]',
              'const cache = app.metadataCache.getFileCache(first)',
              "const cacheByPath = app.metadataCache.getCache('Projects/roadmap.md')",
              "const dest = app.metadataCache.getFirstLinkpathDest('Roadmap')",
              "const linkDest = app.metadataCache.getLinkpathDest('Roadmap#Plan', active.path)",
              "const resolved = app.metadataCache.resolvedLinks['Links/source.md']['Projects/roadmap.md']",
              "const unresolved = app.metadataCache.unresolvedLinks['Links/source.md']['Missing']",
              "const rootList = app.vault.adapter.list('')",
              "const projectList = app.vault.adapter.list('Projects')",
              "const projectFolder = app.vault.getAbstractFileByPath('Projects')",
              "const folderByPath = app.vault.getFolderByPath('Projects')",
              "const resourcePath = app.vault.getResourcePath(first)",
              "const stat = app.vault.adapter.stat('Projects/roadmap.md')",
              "const tagMap = app.metadataCache.getTags()",
              "const statuses = app.metadataCache.getFrontmatterPropertyValuesForKey('status').join(',')",
              "const aliases = app.metadataCache.getFrontmatterPropertyValuesForKey('aliases').join(',')",
              'const backlinks = app.metadataCache.getBacklinksForFile(dest)',
              "const parent = app.fileManager.getNewFileParent(active.path, 'Projects/draft.md')",
              "const linkText = app.metadataCache.fileToLinktext(dest, active.path)",
              'const activeView = app.workspace.getActiveViewOfType(MarkdownView)',
              'const firstIsFile = first instanceof TFile',
              'const root = app.vault.getRoot()',
              'const rootIsFolder = root instanceof TFolder',
              'const typeTokens = [active instanceof TAbstractFile, first instanceof TAbstractFile, root instanceof TAbstractFile, app.vault instanceof Vault, app.vault.adapter instanceof DataAdapter, app.metadataCache instanceof MetadataCache, app.workspace instanceof Workspace, app.fileManager instanceof FileManager].join(\':\')',
              "let traverseCount = 0",
              "app.vault.recurseChildren(root, () => { traverseCount = traverseCount + 1 })",
              "const parsedLink = parseLinktext('Roadmap#Plan|Alias')",
              "const splitLink = splitSubpath('Projects/roadmap.md#Plan')",
              "const compatHelpers = [traverseCount, app.vault.getAvailablePath('Projects/roadmap', 'md'), app.vault.getAvailablePathForAttachment('/roadmap.md', active.path), app.vault.adapter.getName(), app.vault.adapter.getFullPath('/Projects//roadmap.md'), parsedLink.path + parsedLink.subpath, splitLink.path + splitLink.subpath, getLinkpath('Roadmap#Plan'), getAllTags(cache).join(',')].join(':')",
              'const folderCount = app.vault.getAllFolders(true).length',
              "let vaultEvent = 'none'",
              "app.vault.offref(app.vault.on('modify', file => { vaultEvent = file.path }))",
              "let metadataEvent = 'none'",
              "app.metadataCache.offref(app.metadataCache.on('changed', (file, _data, changedCache) => { metadataEvent = file.path + ':' + changedCache.tags.length }))",
              "let resolvedEvent = 'none'",
              "app.metadataCache.offref(app.metadataCache.on('resolve', file => { resolvedEvent = file.path }))",
              "let iterated = 'none'",
              "app.workspace.iterateAllLeaves(leaf => { iterated = leaf.view.file instanceof TFile ? leaf.view.file.path : 'not-file' })",
              "let opened = 'cold'",
              "app.workspace.onLayoutReady(() => { opened = 'ready' })",
              "const ref = app.workspace.on('file-open', file => { opened = opened + ':' + file.path })",
              'app.workspace.offref(ref)',
              "const leaf = app.workspace.getLeaf()",
              "const activeLeaf = app.workspace.getActiveLeaf()",
              "const rightLeaf = app.workspace.getRightLeaf(false)",
              "const leftLeaf = app.workspace.getLeftLeaf(false)",
              "const layout = app.workspace.getLayout()",
              "app.workspace.changeLayout(layout)",
              "const openedLinkLeaf = app.workspace.openLinkText('Roadmap#Plan', active.path)",
              'const openedFileLeaf = app.workspace.openFile(dest, { active: true })',
              'const leafOpenedFile = leaf.openFile(first)',
              'const leafState = leaf.getViewState()',
              "const editorSummary = [openedLinkLeaf.view.editor.getLine(0), openedLinkLeaf.view.editor.lineCount(), openedLinkLeaf.view.editor.offsetToPos(6).line + ',' + openedLinkLeaf.view.editor.offsetToPos(6).ch, openedLinkLeaf.view.editor.posToOffset({ line: 1, ch: 3 })].join(':')",
              "app.vault.off('modify', () => {})",
              "app.metadataCache.off('resolve', () => {})",
              "app.workspace.off('file-open', () => {})",
              "app.workspace.trigger('layout-change')",
              'app.workspace.requestSaveLayout()',
              'app.workspace.revealLeaf(leaf)',
              "app.workspace.detachLeavesOfType('markdown')",
              "const recentFiles = app.workspace.getLastOpenFiles().slice(0, 2).join(',')",
              "const link = app.fileManager.generateMarkdownLink(dest, active.path, '#Plan', 'roadmap plan')",
              "const command = app.commands.listCommands().find(item => item.id === 'local.obsidian:show-dashboard')",
              "const commandIds = app.commands.listCommandIds().slice(0, 2).join(',')",
              "const foundCommand = app.commands.findCommand(command.id)",
              "const commandRef = app.commands.on('command-added')",
              "app.commands.offref(commandRef)",
              "const commandTokens = [app.commands.commands[command.id].name, commandIds, foundCommand.name, app.commands.executeCommand(command), app.commands.executeCommand({ id: command.id }), app.hotkeyManager.getHotkeys(command.id).length, app.hotkeyManager.getDefaultHotkeys(command.id).length, app.workspace.getLeafById('main') === activeLeaf, rightLeaf === activeLeaf, leftLeaf === activeLeaf, layout.main.type].join(':')",
              "return [active.path, obsidianTokens, typeTokens, classTokens, componentTokens, uiTokens, pluginRefs, menuTokens, app.vault.getName() + ':' + app.vault.getFiles().length + ':' + app.vault.getAllLoadedFiles().length, app.vault.cachedRead(first).slice(0, 13), cache.tags[0].tag + ':' + cacheByPath.tags[1].tag + ':' + tagMap['#planning'], rootList.folders.join(','), projectFolder.name + ':' + folderByPath.name + ':' + projectList.files[0] + ':' + app.vault.adapter.exists(projectList.files[0]), resourcePath, stat.type + ':' + stat.size + ':' + app.vault.getConfig('attachmentFolderPath'), statuses + ':' + aliases, parent.name + ':' + linkText + ':' + backlinks.data.get('Links/source.md').length, compatHelpers, activeView.file.path + ':' + firstIsFile + ':' + rootIsFolder + ':' + folderCount + ':' + iterated, vaultEvent + ':' + metadataEvent + ':' + resolvedEvent, opened + ':' + leaf.view.getViewType() + ':' + app.workspace.getLeavesOfType(MarkdownView).length + ':' + (activeLeaf === leaf) + ':' + (leaf instanceof WorkspaceLeaf), openedLinkLeaf.view.file.path + ':' + openedFileLeaf.view.file.path + ':' + leafOpenedFile.view.file.path + ':' + leafState.type + ':' + leafState.state.file, linkDest.path + ':' + editorSummary, recentFiles, dest.path + ':' + resolved + ':' + unresolved, link, app.commands.executeCommandById('clawcontrol:vault-stats'), command.name, app.commands.executeCommandById(command.id), commandTokens].join('\\n')",
            ].join('; '),
          },
        }),
        '```',
      ].join('\n'),
    )

    const linkedNotes = [
      ...notes,
      note({
        _id: 'Projects/spec.md',
        title: 'Spec',
        folder: 'Projects',
        aliases: ['Spec Alias'],
        properties: { status: 'draft' },
        updated_at: 15,
      }),
      note({
        _id: 'Links/source.md',
        title: 'Source',
        links: ['Roadmap', 'Missing'],
        properties: { status: 'active' },
      }),
    ]
    const result = runVaultPluginRuntime(linkedNotes, { plugin: 'local.obsidian' }, plugin, 'Inbox/idea.md')

    expect(result).toEqual({
      ok: true,
      markdown:
        'Inbox/idea.md\nSaved:1200:true:Projects/roadmap.md\ntrue:true:true:true:true:true:true:true\nlocal.obsidian:true:Sync:**Bold**\ntrue:Title:Final:Final:true:true:true:true:alpha:beta:true:Save:check:Save note:true:clicked:true:true:true:_Render_:_Render_\nyes:Picker:open:closed:true:Alpha:Find:1:true\nclick:markdown:markdown:markdown:Ready:ok\nOpen:true:2:true:3,4:clicked:false\nClawControl Local Vault:4:8\n- [x] Draft\n-\n#strategy:#planning:2\nInbox,Links,Projects\nProjects:Projects:Projects/roadmap.md:true\n/api/vault/local/media?id=Projects%2Froadmap.md\nfile:24:Attachments\nactive,draft:Spec Alias\nProjects:Projects/roadmap:1\n7:Projects/roadmap 1.md:Attachments/roadmap.md:ClawControl Local Vault:Projects/roadmap.md:Roadmap#Plan:Projects/roadmap.md#Plan:Roadmap:#strategy,#planning\nInbox/idea.md:true:true:4:Inbox/idea.md\nInbox/idea.md:Inbox/idea.md:1:Inbox/idea.md\nready:Inbox/idea.md:markdown:1:true:true\nProjects/roadmap.md:Projects/roadmap.md:Projects/roadmap.md:markdown:Inbox/idea.md\nProjects/roadmap.md:- [x] Draft:2:0,6:15\nInbox/idea.md,Projects/roadmap.md\nProjects/roadmap.md:1:1\n[[Projects/roadmap#Plan|roadmap plan]]\n{"plugin":"vault.stats"}\nShow dashboard\n{"title":"Command dashboard","limit":1,"plugin":"local.obsidian"}\nShow dashboard:clawcontrol:vault-stats,clawcontrol:recent-notes:Show dashboard:{"title":"Command dashboard","limit":1,"plugin":"local.obsidian"}:{"title":"Command dashboard","limit":1,"plugin":"local.obsidian"}:0:0:true:true:true:split',
    })
  })

  it('keeps the Obsidian-style facade empty until permissions are granted', () => {
    const [plugin] = parseVaultPluginManifests(
      [
        '```claw-plugin-manifest',
        JSON.stringify({
          id: 'local.obsidian-limited',
          label: 'Limited Obsidian adapter',
          description: 'No vault permissions',
          permissions: [],
          runtime: {
            language: 'claw-script',
            code: [
              'const active = app.workspace.getActiveFile()',
              "return String(active) + '\\nfiles:' + app.vault.getMarkdownFiles().length + '\\nread:' + app.vault.cachedRead('Projects/roadmap.md').length + '\\nresource:' + app.vault.getResourcePath('Projects/roadmap.md') + '\\nfrontmatter:' + app.metadataCache.getFrontmatterPropertyValuesForKey('status').length + '\\nmeta:' + app.metadataCache.getFileCache('Projects/roadmap.md')",
            ].join('; '),
          },
        }),
        '```',
      ].join('\n'),
    )

    const result = runVaultPluginRuntime(notes, { plugin: 'local.obsidian-limited' }, plugin, 'Projects/roadmap.md')

    expect(result).toEqual({ ok: true, markdown: 'null\nfiles:0\nread:0\nresource:\nfrontmatter:0\nmeta:null' })
  })

  it('exposes richer Obsidian metadata cache records with permission gating', () => {
    const [plugin] = parseVaultPluginManifests(
      [
        '```claw-plugin-manifest',
        JSON.stringify({
          id: 'local.metadata-cache',
          label: 'Metadata cache',
          description: 'Reads cached file structure',
          permissions: ['read:metadata'],
          runtime: {
            language: 'claw-script',
            code: [
              "const cache = app.metadataCache.getCache('Projects/roadmap.md')",
              "const cached = app.metadataCache.getCachedFiles().slice(0, 2).join(',')",
              "return [cached, cache.headings[0].heading + ':' + cache.headings[0].level, cache.listItems.length + ':' + cache.listItems[0].task, cache.embeds[0].link + ':' + cache.embeds[0].displayText, cache.sections.map(section => section.type).join(',')].join('\\n')",
            ].join('; '),
          },
        }),
        '```',
      ].join('\n'),
    )
    const pluginNotes = [
      ...notes,
      note({
        _id: 'Projects/roadmap.md',
        title: 'Roadmap',
        folder: 'Projects',
        tags: ['strategy'],
        links: ['Spec'],
        content: ['# Plan', '- [x] Draft', '![[Assets/diagram.png|Diagram]]', '> [!note] Launch'].join('\n'),
      }),
    ]

    expect(runVaultPluginRuntime(pluginNotes, { plugin: 'local.metadata-cache' }, plugin, 'Projects/roadmap.md')).toEqual({
      ok: true,
      markdown: 'Inbox/idea.md,Projects/roadmap.md\nPlan:1\n1:x\nAssets/diagram.png:Diagram\nheading,list,paragraph,blockquote',
    })
  })

  it('loads and emits vault-owned plugin data blocks through the safe app facade', () => {
    const [plugin] = parseVaultPluginManifests(
      [
        '```claw-plugin-manifest',
        JSON.stringify({
          id: 'local.data',
          label: 'Plugin data',
          description: 'Uses local vault-owned settings',
          permissions: ['read:plugin-data', 'write:plugin-data'],
          runtime: {
            language: 'claw-script',
            code: [
              'const data = app.loadData()',
              "return data.theme + ':' + data.count + '\\n' + app.saveData({ theme: 'graph', count: data.count + 1 })",
            ].join('; '),
          },
        }),
        '```',
      ].join('\n'),
    )
    const storedData = vaultPluginDataMarkdown('local.data', { theme: 'focus', count: 2 })
    const nextData = vaultPluginDataMarkdown('local.data', { theme: 'graph', count: 3 })
    const pluginNotes = [
      ...notes,
      note({ _id: 'Plugins/data.md', title: 'Plugin data', content: storedData, updated_at: 60 }),
    ]

    expect(parseVaultPluginDataBlocks(storedData)).toEqual([
      expect.objectContaining({
        plugin: 'local.data',
        data: { count: 2, theme: 'focus' },
        checksum: expect.stringMatching(/^[a-f0-9]{8}$/),
      }),
    ])
    expect(buildVaultPluginDataRecords(pluginNotes)).toEqual([
      expect.objectContaining({
        plugin: 'local.data',
        sourceNoteId: 'Plugins/data.md',
        sourceTitle: 'Plugin data',
      }),
    ])
    expect(buildVaultPluginDataStore(pluginNotes)).toEqual({
      'local.data': { count: 2, theme: 'focus' },
    })
    expect(parseVaultPluginDataBlocks(storedData.replace(/"checksum": "[a-f0-9]+"/, '"checksum": "deadbeef"'))).toEqual(
      [],
    )

    const result = runVaultPluginRuntime(pluginNotes, { plugin: 'local.data' }, plugin)

    expect(result).toEqual({ ok: true, markdown: `focus:2\n${nextData}` })
  })

  it('emits permission-scoped vault write intents instead of mutating files silently', () => {
    const [plugin] = parseVaultPluginManifests(
      [
        '```claw-plugin-manifest',
        JSON.stringify({
          id: 'local.writer',
          label: 'Writer plugin',
          description: 'Requests safe local vault writes',
          permissions: ['read:files', 'read:metadata', 'write:files', 'write:metadata'],
          runtime: {
            language: 'claw-script',
            code: [
              "const file = app.vault.getFileByPath('Projects/roadmap.md')",
              "const create = app.vault.create('Projects/new.md', '# New')",
              "const modify = app.vault.modify(file, '# Updated')",
              "const copy = app.vault.copy(file, 'Projects/copy.md')",
              "const append = app.vault.append(file, '\\n- [ ] Ship')",
              "const rename = app.vault.rename(file, 'Projects/roadmap-renamed.md')",
              'const trash = app.vault.trash(file)',
              "const frontmatter = app.fileManager.processFrontMatter(file, data => { data.status = 'review'; data.aliases = ['Roadmap Alias'] })",
              "const adapterWrite = app.vault.adapter.write('Projects/adapter.md', '# Adapter')",
              "const adapterAppend = app.vault.adapter.append('Projects/roadmap.md', '\\n- [ ] Adapter append')",
              "const adapterCopy = app.vault.adapter.copy('Projects/roadmap.md', 'Projects/adapter-copy.md')",
              "const adapterRename = app.vault.adapter.rename('Projects/roadmap.md', 'Projects/adapter-renamed.md')",
              "const adapterRemove = app.vault.adapter.remove('Projects/roadmap.md')",
              "return [create, modify, copy, append, rename, trash, frontmatter, adapterWrite, adapterAppend, adapterCopy, adapterRename, adapterRemove].join('\\n')",
            ].join('; '),
          },
        }),
        '```',
      ].join('\n'),
    )
    const result = runVaultPluginRuntime(notes, { plugin: 'local.writer' }, plugin, 'Projects/roadmap.md')
    expect(result.ok, result.ok ? '' : result.error).toBe(true)
    const markdown = result.ok ? result.markdown : ''
    const records = parseVaultPluginWriteBlocks(markdown)

    expect(records).toEqual([
      expect.objectContaining({ plugin: 'local.writer', action: 'create', path: 'Projects/new.md', content: '# New' }),
      expect.objectContaining({ plugin: 'local.writer', action: 'modify', path: 'Projects/roadmap.md', content: '# Updated' }),
      expect.objectContaining({
        plugin: 'local.writer',
        action: 'create',
        path: 'Projects/copy.md',
        content: '- [x] Draft\n- [ ] Review',
      }),
      expect.objectContaining({
        plugin: 'local.writer',
        action: 'modify',
        path: 'Projects/roadmap.md',
        content: '- [x] Draft\n- [ ] Review\n- [ ] Ship',
      }),
      expect.objectContaining({
        plugin: 'local.writer',
        action: 'rename',
        path: 'Projects/roadmap.md',
        newPath: 'Projects/roadmap-renamed.md',
      }),
      expect.objectContaining({ plugin: 'local.writer', action: 'trash', path: 'Projects/roadmap.md' }),
      expect.objectContaining({
        plugin: 'local.writer',
        action: 'frontmatter',
        path: 'Projects/roadmap.md',
        frontmatter: expect.objectContaining({ status: 'review', aliases: ['Roadmap Alias'] }),
      }),
      expect.objectContaining({ plugin: 'local.writer', action: 'create', path: 'Projects/adapter.md', content: '# Adapter' }),
      expect.objectContaining({
        plugin: 'local.writer',
        action: 'modify',
        path: 'Projects/roadmap.md',
        content: '- [x] Draft\n- [ ] Review\n- [ ] Adapter append',
      }),
      expect.objectContaining({
        plugin: 'local.writer',
        action: 'create',
        path: 'Projects/adapter-copy.md',
        content: '- [x] Draft\n- [ ] Review',
      }),
      expect.objectContaining({
        plugin: 'local.writer',
        action: 'rename',
        path: 'Projects/roadmap.md',
        newPath: 'Projects/adapter-renamed.md',
      }),
      expect.objectContaining({ plugin: 'local.writer', action: 'trash', path: 'Projects/roadmap.md' }),
    ])
    expect(buildVaultPluginWriteRecords([...notes, note({ _id: 'Plugins/writes.md', title: 'Writes', content: markdown })]))
      .toEqual(records.map(record => expect.objectContaining({ ...record, sourceNoteId: 'Plugins/writes.md' })))
    expect(
      parseVaultPluginWriteBlocks(
        vaultPluginWriteMarkdown('local.writer', { action: 'modify', path: '../Secrets.md', content: 'nope' }),
      ),
    ).toEqual([])
    expect(parseVaultPluginWriteBlocks(markdown.replace(/"checksum": "[a-f0-9]+"/g, '"checksum": "deadbeef"'))).toEqual(
      [],
    )
  })

  it('renders plugin write blocks and vault-wide write review tables for user approval', () => {
    const writeMarkdown = [
      vaultPluginWriteMarkdown('local.writer', { action: 'create', path: 'Projects/new.md', content: '# New' }),
      vaultPluginWriteMarkdown('local.writer', {
        action: 'frontmatter',
        path: 'Projects/roadmap.md',
        frontmatter: { status: 'review', aliases: ['Roadmap Alias'] },
      }),
    ].join('\n')
    const pluginNotes = [
      ...notes,
      note({ _id: 'Plugins/writes.md', title: 'Writes', content: writeMarkdown, updated_at: 60 }),
    ]

    expect(renderVaultPluginBlocks(writeMarkdown, pluginNotes)).toContain(
      '| `local.writer` | `create` | `Projects/new.md` | 5 chars |',
    )
    expect(renderVaultPluginBlocks(writeMarkdown.replace(/"checksum": "[a-f0-9]+"/, '"checksum": "deadbeef"'), pluginNotes))
      .toContain('Invalid or tampered plugin write request')

    const review = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"vault.plugin-writes","title":"Pending local changes"}', '```'].join('\n'),
      pluginNotes,
    )
    expect(review).toContain('### Pending local changes')
    expect(review).toContain('| Plugin | Action | Path | Details | Source | Checksum |')
    expect(review).toContain('[[Plugins/writes.md|Writes]]')
    expect(review).toContain('`aliases`, `status`')
  })

  it('removes applied plugin write blocks from source notes after approval', () => {
    const create = vaultPluginWriteMarkdown('local.writer', {
      action: 'create',
      path: 'Projects/new.md',
      content: '# New',
    })
    const modify = vaultPluginWriteMarkdown('local.writer', {
      action: 'modify',
      path: 'Projects/roadmap.md',
      content: '# Updated',
    })
    const [applied] = parseVaultPluginWriteBlocks(create)
    const markdown = ['# Pending writes', create, modify].join('\n\n')

    const cleaned = removeAppliedVaultPluginWriteBlocks(markdown, [applied.checksum])

    expect(cleaned).toContain('# Pending writes')
    expect(cleaned).not.toContain(applied.checksum)
    expect(cleaned).toContain('Projects/roadmap.md')
  })

  it('plans approved plugin write intents with checkpoints and conflict skips', () => {
    const records = [
      ...parseVaultPluginWriteBlocks(
        vaultPluginWriteMarkdown('local.writer', { action: 'create', path: 'Projects/new.md', content: '# New' }),
      ),
      ...parseVaultPluginWriteBlocks(
        vaultPluginWriteMarkdown('local.writer', { action: 'modify', path: 'Projects/roadmap.md', content: '# Updated' }),
      ),
      ...parseVaultPluginWriteBlocks(
        vaultPluginWriteMarkdown('local.writer', {
          action: 'frontmatter',
          path: 'Inbox/idea.md',
          frontmatter: { status: 'review', tags: ['next', '#focus'], aliases: ['Idea Alias'] },
        }),
      ),
      ...parseVaultPluginWriteBlocks(
        vaultPluginWriteMarkdown('local.writer', { action: 'rename', path: 'Inbox/idea.md', newPath: 'Inbox/renamed.md' }),
      ),
      ...parseVaultPluginWriteBlocks(
        vaultPluginWriteMarkdown('local.writer', { action: 'trash', path: 'Projects/roadmap.md' }),
      ),
      ...parseVaultPluginWriteBlocks(
        vaultPluginWriteMarkdown('local.writer', { action: 'create', path: 'Projects/roadmap.md', content: 'duplicate' }),
      ),
    ]

    const plan = planVaultPluginWriteApply(notes, records, 5000)

    expect(plan.applied.map(change => [change.record.action, change.noteId, change.nextNoteId])).toEqual([
      ['create', 'Projects/new.md', 'Projects/new.md'],
      ['modify', 'Projects/roadmap.md', 'Projects/roadmap.md'],
      ['frontmatter', 'Inbox/idea.md', 'Inbox/idea.md'],
      ['rename', 'Inbox/idea.md', 'Inbox/renamed.md'],
      ['trash', 'Projects/roadmap.md', 'Projects/roadmap.md'],
    ])
    expect(plan.skipped).toEqual([
      expect.objectContaining({ reason: 'target exists' }),
    ])
    expect(plan.checkpointNoteIds).toEqual(['Projects/roadmap.md', 'Inbox/idea.md'])
    expect(plan.notes.find(note => note._id === 'Projects/new.md')).toEqual(
      expect.objectContaining({ title: 'new', folder: 'Projects', content: '# New', created_at: 5000 }),
    )
    expect(plan.notes.find(note => note._id === 'Inbox/renamed.md')).toEqual(
      expect.objectContaining({
        title: 'renamed',
        folder: 'Inbox',
        content: expect.stringContaining('aliases: Idea Alias'),
        tags: ['next', 'focus'],
        aliases: ['Idea Alias'],
        properties: { status: 'review' },
      }),
    )
    expect(plan.notes.find(note => note._id === 'Inbox/renamed.md')?.content).toContain('status: review')
    expect(plan.notes.find(note => note._id === 'Inbox/renamed.md')?.content).toContain('tags:\n  - next\n  - #focus')
    expect(plan.notes.find(note => note._id === 'Projects/roadmap.md')).toEqual(
      expect.objectContaining({
        content: '# Updated',
        folder: 'Trash/Projects',
        trash_origin_path: 'Projects',
        trashed_at: 5000,
      }),
    )
  })

  it('withholds vault write intents without explicit plugin permissions', () => {
    const [plugin] = parseVaultPluginManifests(
      [
        '```claw-plugin-manifest',
        JSON.stringify({
          id: 'local.readonly-writer',
          label: 'Readonly writer',
          description: 'Missing write permissions',
          permissions: ['read:files'],
          runtime: {
            language: 'claw-script',
            code: [
              "const file = app.vault.getFileByPath('Projects/roadmap.md')",
              "return app.vault.modify(file, '# Updated') + '\\n' + app.fileManager.processFrontMatter(file, data => { data.status = 'review' })",
            ].join('; '),
          },
        }),
        '```',
      ].join('\n'),
    )

    expect(runVaultPluginRuntime(notes, { plugin: 'local.readonly-writer' }, plugin, 'Projects/roadmap.md')).toEqual({
      ok: true,
      markdown: '[missing permission: write:files]\n[missing permission: write:metadata]',
    })
  })

  it('audits plugin registry entries and keeps disabled vault plugins from running', () => {
    const manifest = [
      '```claw-plugin-manifest',
      JSON.stringify({
        id: 'local.disabled',
        label: 'Disabled plugin',
        description: 'Should be visible but inactive',
        enabled: false,
        version: '1.2.3',
        author: 'Ada',
        permissions: ['read:vault-stats'],
        template: 'Notes: {{noteCount}}',
      }),
      '```',
    ].join('\n')
    const pluginNotes = [...notes, note({ _id: 'Plugins/disabled.md', title: 'Disabled plugin', content: manifest })]

    expect(installedVaultPlugins(pluginNotes).some(plugin => plugin.id === 'local.disabled')).toBe(false)
    expect(buildVaultPluginRegistry(pluginNotes)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          source: 'vault',
          sourceNoteId: 'Plugins/disabled.md',
          enabled: false,
          integrity: 'unsigned',
          checksum: expect.stringMatching(/^[a-f0-9]{8}$/),
          plugin: expect.objectContaining({ id: 'local.disabled', version: '1.2.3', author: 'Ada' }),
          permissions: ['read:vault-stats'],
        }),
      ]),
    )

    const disabledRender = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"local.disabled"}', '```'].join('\n'),
      pluginNotes,
    )
    const registryRender = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"vault.plugins","includeDisabled":true}', '```'].join('\n'),
      pluginNotes,
    )

    expect(disabledRender).toContain('Local plugin is not installed: local.disabled')
    expect(registryRender).toContain('permission-scoped Obsidian compatibility facade')
    expect(registryRender).toContain('arbitrary native/community Obsidian plugins are not executed')
    expect(registryRender).toContain('`local.disabled` Disabled plugin | disabled | unsigned `')
    expect(registryRender).toContain('[[Plugins/disabled.md|Disabled plugin]]')
    expect(registryRender).toContain('`read:vault-stats`')
  })

  it('marks manifest integrity as verified or mismatched from the expected checksum', () => {
    const plugin = {
      id: 'local.verified',
      label: 'Verified plugin',
      description: 'Integrity checked',
      enabled: true,
      version: '0.1.0',
      author: 'Ada',
      permissions: ['read:vault-stats' as const],
      template: 'Notes: {{noteCount}}',
    }
    const checksum = vaultPluginManifestChecksum(plugin)
    const verifiedManifest = ['```claw-plugin-manifest', JSON.stringify({ ...plugin, checksum }), '```'].join('\n')
    const mismatchManifest = [
      '```claw-plugin-manifest',
      JSON.stringify({ ...plugin, id: 'local.mismatch', checksum }),
      '```',
    ].join('\n')
    const pluginNotes = [
      ...notes,
      note({ _id: 'Plugins/verified.md', title: 'Verified plugin', content: verifiedManifest }),
      note({ _id: 'Plugins/mismatch.md', title: 'Mismatch plugin', content: mismatchManifest }),
    ]

    const registry = buildVaultPluginRegistry(pluginNotes)
    const registryRender = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"vault.plugins","includeDisabled":true}', '```'].join('\n'),
      pluginNotes,
    )

    expect(registry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ plugin: expect.objectContaining({ id: 'local.verified' }), integrity: 'verified' }),
        expect.objectContaining({ plugin: expect.objectContaining({ id: 'local.mismatch' }), integrity: 'mismatch' }),
      ]),
    )
    expect(registryRender).toContain('`local.verified` Verified plugin | enabled | verified')
    expect(registryRender).toContain('`local.mismatch` Verified plugin | enabled | mismatch')
  })

  it('renders a local plugin marketplace catalog with package metadata and install snippets', () => {
    const manifest = [
      '```claw-plugin-manifest',
      JSON.stringify({
        id: 'local.market',
        label: 'Market plugin',
        description: 'Marketplace ready package',
        enabled: true,
        version: '1.0.0',
        author: 'Ada',
        apiVersion: 'notes-plugin-v1',
        minAppVersion: '0.1.0',
        license: 'private',
        homepage: 'https://example.com/plugin',
        repository: 'https://example.com/repo',
        keywords: ['Dashboard', 'local-first', 'bad keyword!'],
        permissions: ['read:vault-stats'],
        template: 'Notes: {{noteCount}}',
      }),
      '```',
    ].join('\n')
    const pluginNotes = [...notes, note({ _id: 'Plugins/market.md', title: 'Market plugin', content: manifest })]
    const registry = buildVaultPluginRegistry(pluginNotes)
    const marketplaceRender = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"vault.marketplace","includeDisabled":true}', '```'].join('\n'),
      pluginNotes,
    )

    expect(registry).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          plugin: expect.objectContaining({
            id: 'local.market',
            apiVersion: 'notes-plugin-v1',
            minAppVersion: '0.1.0',
            license: 'private',
            homepage: 'https://example.com/plugin',
            repository: 'https://example.com/repo',
            keywords: ['dashboard', 'local-first'],
          }),
        }),
      ]),
    )
    expect(marketplaceRender).toContain('### Plugin marketplace')
    expect(marketplaceRender).toContain('permission-scoped Obsidian compatibility facade')
    expect(marketplaceRender).toContain('`local.market` Market plugin')
    expect(marketplaceRender).toContain('1.0.0')
    expect(marketplaceRender).toContain('API notes-plugin-v1 · app 0.1.0+')
    expect(marketplaceRender).toContain('`{"plugin":"local.market","title":"Market plugin"}`')
    expect(marketplaceRender).toContain('#dashboard #local-first')
  })

  it('reads signed marketplace packages and renders install/update manifests', () => {
    const packagePlugin = {
      id: 'local.package',
      label: 'Package plugin',
      description: 'Installable marketplace package',
      enabled: true,
      version: '2.0.0',
      author: 'Ada',
      apiVersion: 'notes-plugin-v1',
      minAppVersion: '0.2.0',
      permissions: ['read:vault-stats' as const],
      template: 'Notes: {{noteCount}}',
    }
    const checksum = vaultPluginManifestChecksum(packagePlugin)
    const packageBlock = [
      '```claw-plugin-package',
      JSON.stringify({
        packageId: 'pkg.local.package',
        sourceUrl: 'https://example.com/feed.json',
        plugin: packagePlugin,
        checksum,
        signature: {
          signer: 'Ada',
          checksum,
          signature: `claw-sign-v1:Ada:${checksum}`,
        },
      }),
      '```',
    ].join('\n')
    const feedNotes = [...notes, note({ _id: 'Plugins/feed.md', title: 'Marketplace feed', content: packageBlock })]

    expect(parseVaultPluginPackages(packageBlock)).toEqual([
      expect.objectContaining({
        packageId: 'pkg.local.package',
        checksum,
        integrity: 'signed',
        plugin: expect.objectContaining({ id: 'local.package', integrity: 'signed' }),
      }),
    ])
    expect(buildVaultPluginMarketplacePackages(feedNotes)).toEqual([
      expect.objectContaining({
        sourceNoteId: 'Plugins/feed.md',
        sourceTitle: 'Marketplace feed',
      }),
    ])

    const rendered = renderVaultPluginBlocks(
      ['```claw-plugin', '{"plugin":"vault.marketplace","includeDisabled":true}', '```'].join('\n'),
      feedNotes,
    )

    expect(rendered).toContain('`local.package` Package plugin')
    expect(rendered).toContain(`signed \`${checksum}\``)
    expect(rendered).toContain('install below')
    expect(rendered).toContain('```claw-plugin-manifest')
    expect(rendered).toContain('"id": "local.package"')
    expect(rendered).toContain(`"checksum": "${checksum}"`)
  })

  it('fetches a remote marketplace feed without credentials and converts it to vault package blocks', async () => {
    const packagePlugin = {
      id: 'local.remote',
      label: 'Remote package',
      description: 'Fetched from a remote feed',
      enabled: true,
      version: '1.0.0',
      permissions: ['read:tags' as const],
      template: 'Tags:\n{{tagList}}',
    }
    const checksum = vaultPluginManifestChecksum(packagePlugin)
    const payload = {
      packages: [
        {
          packageId: 'pkg.local.remote',
          plugin: packagePlugin,
          checksum,
          signature: {
            signer: 'Ada',
            checksum,
            signature: `claw-sign-v1:Ada:${checksum}`,
          },
        },
      ],
    }
    const fetchCalls: Array<[RequestInfo | URL, RequestInit | undefined]> = []
    const fetchImpl = async (input: RequestInfo | URL, init?: RequestInit) => {
      fetchCalls.push([input, init])
      return {
        ok: true,
        status: 200,
        json: async () => payload,
      } as Response
    }

    const packages = await fetchVaultPluginMarketplaceFeed('https://plugins.example/feed.json#ignored', fetchImpl)
    const markdown = vaultPluginMarketplacePackagesMarkdown(packages)

    expect(fetchCalls).toEqual([
      [
        'https://plugins.example/feed.json',
        expect.objectContaining({
          credentials: 'omit',
          cache: 'no-store',
          headers: { Accept: 'application/json' },
        }),
      ],
    ])
    expect(packages).toEqual([
      expect.objectContaining({
        packageId: 'pkg.local.remote',
        sourceUrl: 'https://plugins.example/feed.json',
        integrity: 'signed',
      }),
    ])
    expect(parseVaultPluginMarketplaceFeed(payload, 'https://plugins.example/feed.json')).toEqual(packages)
    expect(parseVaultPluginPackages(markdown)).toEqual([
      expect.objectContaining({
        packageId: 'pkg.local.remote',
        integrity: 'signed',
        plugin: expect.objectContaining({ id: 'local.remote' }),
      }),
    ])
  })

  it('rejects non-local insecure marketplace feeds', async () => {
    await expect(fetchVaultPluginMarketplaceFeed('http://plugins.example/feed.json', async () => {
      throw new Error('should not fetch')
    })).rejects.toThrow('HTTPS')
  })

  it('verifies marketplace package signatures only for vault-trusted publisher keys', async () => {
    const keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: 'P-256' },
      true,
      ['sign', 'verify'],
    )
    const publicKey = await crypto.subtle.exportKey('jwk', keyPair.publicKey)
    const packagePlugin = {
      id: 'local.signed',
      label: 'Signed package',
      description: 'Public-key signed marketplace package',
      enabled: true,
      version: '1.0.0',
      permissions: ['read:vault-stats' as const],
      template: 'Notes: {{noteCount}}',
    }
    const checksum = vaultPluginManifestChecksum(packagePlugin)
    const unsigned = parseVaultPluginMarketplaceFeed({
      packages: [
        {
          packageId: 'pkg.local.signed',
          plugin: packagePlugin,
          checksum,
          signature: {
            signer: 'Ada',
            checksum,
            signature: checksum,
            publicKey,
          },
        },
      ],
    })[0]
    const payload = vaultPluginPackageSigningPayload(unsigned)
    const signature = base64UrlEncode(await crypto.subtle.sign(
      { name: 'ECDSA', hash: 'SHA-256' },
      keyPair.privateKey,
      new TextEncoder().encode(payload),
    ))
    const signedPayload = {
      packages: [
        {
          packageId: 'pkg.local.signed',
          plugin: packagePlugin,
          checksum,
          signature: {
            signer: 'Ada',
            checksum,
            signature,
            publicKey,
          },
        },
      ],
    }
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      json: async () => signedPayload,
    }) as Response
    const trustBlock = [
      '```claw-plugin-trust',
      JSON.stringify({ signer: 'Ada', publicKey, revoked: false, rotatedToKeyId: '', expiresAt: '2999-01-01T00:00:00Z' }),
      '```',
    ].join('\n')
    const revokedTrustBlock = [
      '```claw-plugin-trust',
      JSON.stringify({ signer: 'Ada', publicKey, revoked: true, rotatedToKeyId: 'next-key' }),
      '```',
    ].join('\n')
    const trustedPublishers = buildVaultPluginTrustedPublishers([
      ...notes,
      note({ _id: 'Plugins/trust.md', title: 'Trusted publishers', content: trustBlock }),
    ])
    const revokedPublishers = buildVaultPluginTrustedPublishers([
      ...notes,
      note({ _id: 'Plugins/revoked.md', title: 'Revoked publisher', content: revokedTrustBlock }),
    ])

    expect(parseVaultPluginTrustedPublishers(trustBlock)).toEqual([
      expect.objectContaining({
        signer: 'Ada',
        keyId: vaultPluginPublicKeyId(publicKey),
        revoked: false,
        expiresAt: '2999-01-01T00:00:00Z',
      }),
    ])
    expect(parseVaultPluginTrustedPublishers(revokedTrustBlock)).toEqual([
      expect.objectContaining({ signer: 'Ada', revoked: true, rotatedToKeyId: 'next-key' }),
    ])
    expect(trustedPublishers).toEqual([
      expect.objectContaining({
        signer: 'Ada',
        keyId: vaultPluginPublicKeyId(publicKey),
        sourceNoteId: 'Plugins/trust.md',
      }),
    ])

    const [signedButUntrusted] = await fetchVaultPluginMarketplaceFeed('https://plugins.example/signed.json', fetchImpl)
    const [verified] = await fetchVaultPluginMarketplaceFeed(
      'https://plugins.example/signed.json',
      fetchImpl,
      trustedPublishers,
    )
    const tampered = await verifyVaultPluginMarketplacePackageSignature({
      ...verified,
      checksum: '00000000',
    }, trustedPublishers)
    const revoked = await verifyVaultPluginMarketplacePackageSignature(verified, revokedPublishers)

    expect(signedButUntrusted.integrity).toBe('signed')
    expect(verified.integrity).toBe('verified')
    expect(verified.plugin.integrity).toBe('verified')
    expect(revoked.integrity).toBe('signed')
    expect(tampered.integrity).toBe('mismatch')
  })
})
