// app/lib/default-config.ts
// The built-in config (spec §10, §12). A vault's soii.config.yml is merged over
// it by resolveConfig(). Workspace and tab ids here are a cross-plan contract.
import type { SoiiConfig } from './types'

// People tabs overlap on purpose: a colleague who is also a friend shows in both. `circle: friends|network` adds anyone else.
const FRIENDS = ['friend', 'partner', 'family', 'flatmate']
const NETWORK = ['mentor', 'investor']

export const DEFAULT_CONFIG: SoiiConfig = {
  title: 'soii',
  home: 'today',
  exclude: ['**/Templates/**', '**/_Templates/**'],
  types: {
    book: ['book', 'books'],
    audiobook: ['audiobook', 'audio-book'],
    movie: ['movie', 'film'],
    documentary: ['documentary', 'docu'],
    video: ['video', 'youtube'],
    research: ['research', 'paper', 'article-research'],
    article: ['article', 'clipping'],
    person: ['person', 'people', 'contact'],
    goal: ['goal', 'bucket', 'bucket-list'],
    account: ['account', 'finance-account'],
    subscription: ['subscription'],
    expense: ['expense', 'purchase'],
    recipe: ['recipe', 'recipie', 'recipes'],
    // Transcripts of recorded video log entries. Not `journal`: vaults use that for daily notes.
    'video-log': ['video-log', 'vlog', 'video-journal'],
    'daily-brief': ['daily-brief', 'daily-report', 'morning-briefing'],
    'weekly-review': ['weekly-review', 'weekly-report', 'weekly-synthesis'],
    // The Capacity workspace's settings note and its leak register (D129).
    capacity: ['capacity'],
    leak: ['leak', 'leaks']
  },
  workspaces: [
    {
      // Everything delivered into the vault's Inbox folder, newest first (the default sort).
      id: 'inbox',
      title: 'Inbox',
      icon: 'inbox',
      tabs: [{ id: 'inbox', title: 'Inbox', view: 'list', query: { path: '00-Inbox/**' } }]
    },
    {
      id: 'today',
      title: 'Today',
      icon: 'sun',
      tabs: [
        { id: 'brief', title: 'Daily brief', view: 'feed', query: [{ type: 'daily-brief' }, { path: '**/daily_report/**' }] },
        {
          id: 'weekly',
          title: 'Weekly review',
          view: 'feed',
          query: [{ type: 'weekly-review' }, { path: ['**/week_report/**', '**/week_logs/**'] }]
        }
      ]
    },
    {
      id: 'library',
      title: 'Library',
      icon: 'books',
      tabs: [
        { id: 'books', title: 'Books', view: 'gallery', query: { type: 'book' } },
        { id: 'audiobooks', title: 'Audiobooks', view: 'gallery', query: { type: 'audiobook' } },
        { id: 'movies', title: 'Movies', view: 'gallery', query: { type: 'movie' } },
        { id: 'documentaries', title: 'Documentaries', view: 'gallery', query: { type: 'documentary' } },
        { id: 'videos', title: 'Videos', view: 'gallery', query: { type: 'video' } },
        {
          id: 'research',
          title: 'Research',
          view: 'table',
          query: { type: 'research' },
          options: { columns: ['title', 'authors', 'year', 'status'] }
        },
        { id: 'articles', title: 'Articles', view: 'list', query: { type: 'article' } },
        { id: 'recipes', title: 'Recipes', view: 'showcase', query: { type: 'recipe' }, sort: [{ field: 'title', dir: 'asc' }] },
        { id: 'journal', title: 'Journal', view: 'feed', query: { type: 'video-log' } }
      ]
    },
    {
      id: 'people',
      title: 'People',
      icon: 'users',
      tabs: [
        {
          id: 'overview',
          title: 'Overview',
          view: 'pulse',
          query: { type: 'person' },
          options: {
            // Days between check-ins per relationship. Others get no reminders unless a note sets `cadence`.
            cadence: {
              friend: 30, partner: 30, family: 30, flatmate: 30,
              mentor: 60, investor: 60
            }
          }
        },
        {
          id: 'friends',
          title: 'Friends',
          view: 'list',
          query: [
            { type: 'person', where: { relationship: FRIENDS } },
            { type: 'person', where: { circle: 'friends' } }
          ],
          sort: [{ field: 'lastSeen', dir: 'desc' }, { field: 'title', dir: 'asc' }],
          options: { subtitle: 'relationship' }
        },
        {
          id: 'network',
          title: 'Network',
          view: 'table',
          query: [
            { type: 'person', where: { relationship: NETWORK } },
            { type: 'person', where: { circle: 'network' } }
          ],
          sort: [{ field: 'lastSeen', dir: 'desc' }, { field: 'title', dir: 'asc' }],
          options: { columns: ['title', 'relationship', 'company', 'role', { field: 'linkedin', label: 'LinkedIn' }, 'lastSeen'] }
        },
        {
          id: 'all',
          title: 'Contacts',
          view: 'table',
          query: { type: 'person' },
          sort: [{ field: 'title', dir: 'asc' }],
          options: { columns: ['title', 'relationship', 'company', 'location', 'lastSeen'] }
        }
      ]
    },
    {
      id: 'finance',
      title: 'Finance',
      icon: 'coins',
      tabs: [
        {
          id: 'overview',
          title: 'Overview',
          view: 'stats',
          query: [{ type: 'subscription' }, { type: 'account' }],
          options: {
            tiles: [
              {
                label: 'Monthly subscriptions',
                agg: 'sum',
                field: 'price',
                type: 'subscription',
                where: { status: 'active' },
                format: 'currency',
                groupBy: 'currency',
                normalize: { field: 'cycle', factors: { weekly: 4.33, monthly: 1, yearly: 0.0833 } }
              },
              { label: 'Active subscriptions', agg: 'count', type: 'subscription', where: { status: 'active' } },
              { label: 'Net balance', agg: 'sum', field: 'balance', type: 'account', format: 'currency', groupBy: 'currency' }
            ]
          }
        },
        {
          id: 'subscriptions',
          title: 'Subscriptions',
          view: 'table',
          query: { type: 'subscription' },
          sort: [{ field: 'title', dir: 'asc' }],
          options: {
            columns: ['title', { field: 'price', format: 'currency' }, 'currency', 'cycle', 'renews', 'status']
          }
        },
        {
          id: 'accounts',
          title: 'Accounts',
          view: 'table',
          query: { type: 'account' },
          sort: [{ field: 'title', dir: 'asc' }],
          options: { columns: ['title', 'institution', { field: 'balance', format: 'currency' }, 'currency'] }
        },
        {
          id: 'expenses',
          title: 'Expenses',
          view: 'table',
          query: { type: 'expense' },
          sort: [{ field: 'date', dir: 'desc' }],
          options: { columns: ['date', 'title', { field: 'amount', format: 'currency' }, 'category', 'paid_with'] }
        },
        { id: 'notes', title: 'Notes', view: 'list', query: [{ tag: 'finance' }, { path: '**/Finance/**' }] }
      ]
    },
    {
      id: 'goals',
      title: 'Goals',
      icon: 'target',
      tabs: [
        { id: 'board', title: 'Board', view: 'board', query: { type: 'goal' }, options: { groupBy: 'status' } },
        { id: 'years', title: 'By year', view: 'board', query: { type: 'goal' }, options: { groupBy: 'year' } },
        { id: 'bucket', title: 'Bucket list', view: 'list', query: { type: 'goal', where: { horizon: ['life', 'bucket'] } } }
      ]
    },
    {
      id: 'projects',
      title: 'Projects',
      icon: 'briefcase',
      tabs: [
        {
          id: 'board',
          title: 'Board',
          view: 'board',
          query: { type: 'project' },
          options: { groupBy: 'status', groups: ['idea', 'active', 'done'], subtitle: 'area' }
        }
      ]
    },
    {
      // The folder /unbox parks tasks, job posts and "check this out" links in. Picked by folder:
      // Backlog notes have no `type`. Moving a card writes its `status` (D126).
      id: 'backlog',
      title: 'Backlog',
      icon: 'kanban',
      tabs: [
        {
          id: 'board',
          title: 'Board',
          view: 'board',
          query: { path: '04-Resources/Backlog/**' },
          // Done newest first; the other columns have no `done`, so they fall through to newest created.
          sort: [{ field: 'done', dir: 'desc' }, { field: 'created', dir: 'desc' }, { field: 'title', dir: 'asc' }],
          options: {
            groupBy: 'status',
            groups: ['backlog', 'doing', 'done', 'dropped'],
            fallback: 'backlog',
            subtitle: 'kind',
            badges: ['lane'],
            flag: 'blocked',
            links: ['issue', 'pr', 'result'],
            filters: [{ field: 'lane', none: 'Needs triage' }, 'kind', 'source'],
            move: true,
            stamp: { done: 'done' }
          }
        }
      ]
    },
    {
      // The shared task system agents and people work from: one note per task in
      // 03-Areas/Tasks/{backlog,completed}/, with a `status` and an `owner` (D132).
      // Review and Done are the two lists a person checks: what waits for approval, what is finished.
      id: 'tasks',
      title: 'Tasks',
      icon: 'checklist',
      tabs: [
        {
          id: 'all',
          title: 'All',
          view: 'board',
          query: { path: '03-Areas/Tasks/**' },
          // Lowest priority number first, then oldest, the order agents pick tasks in. Done newest first.
          sort: [{ field: 'done', dir: 'desc' }, { field: 'priority', dir: 'asc' }, { field: 'created', dir: 'asc' }, { field: 'title', dir: 'asc' }],
          options: {
            groupBy: 'status',
            groups: ['todo', 'in_progress', 'blocked', 'review', 'done'],
            fallback: 'todo',
            subtitle: 'owner',
            badges: ['lane'],
            flag: 'blocked',
            links: ['issue', 'pr', 'result'],
            filters: ['owner', { field: 'lane', none: 'Needs triage' }, 'kind'],
            move: true,
            stamp: { done: 'done' }
          }
        },
        {
          id: 'review',
          title: 'Review',
          view: 'table',
          query: { path: '03-Areas/Tasks/**', where: { status: 'review' } },
          sort: [{ field: 'updated', dir: 'desc' }, { field: 'title', dir: 'asc' }],
          options: { columns: ['title', 'owner', 'priority', { field: 'pr', label: 'PR', format: 'link' }, 'updated'] }
        },
        {
          id: 'done',
          title: 'Done',
          view: 'table',
          query: { path: '03-Areas/Tasks/**', where: { status: 'done' } },
          sort: [{ field: 'done', dir: 'desc' }, { field: 'updated', dir: 'desc' }, { field: 'title', dir: 'asc' }],
          options: { columns: ['title', 'owner', 'tags', { field: 'done', format: 'date' }, 'updated'] }
        }
      ]
    },
    {
      // How full the week is against an 80% line (D129). Counts come from notes the other
      // workspaces already read; meeting hours, a fixed load and the daily `felt` number live on
      // one optional `type: capacity` note, which can also override every weight.
      id: 'capacity',
      title: 'Capacity',
      icon: 'gauge',
      tabs: [
        {
          id: 'load',
          title: 'Load',
          view: 'capacity',
          query: { type: 'capacity' },
          options: {
            target: 80,
            ceiling: 100,
            newProject: 'projects',
            inputs: [
              {
                id: 'projects',
                label: 'Active projects',
                query: { type: 'project', where: { status: 'active' } },
                weight: 15,
                field: 'load',
                hint: 'Notes with type: project and status: active. A load: on a project replaces the weight.'
              },
              {
                id: 'doing',
                label: 'Backlog in progress',
                query: { path: '04-Resources/Backlog/**', where: { status: 'doing' } },
                weight: 5,
                field: 'load',
                hint: 'Backlog notes with status: doing.'
              },
              { id: 'requests', label: 'Inbox', query: { path: '00-Inbox/**' }, weight: 1, hint: 'Requests and captures not filed yet.' },
              {
                id: 'meetings',
                label: 'Meetings, next 7 days',
                value: 'meetings',
                weight: 2,
                unit: 'h',
                hint: 'Hours, from meetings: on the capacity note.'
              },
              { id: 'base', label: 'Fixed load', value: 'base', weight: 1, unit: '%', hint: 'Work outside the vault, from base: on the capacity note.' },
              {
                id: 'leaks',
                label: 'Accepted leaks',
                query: { type: 'leak', where: { verdict: 'accept' } },
                weight: 1,
                field: 'cost',
                hint: 'Leak notes with verdict: accept, at their own cost.'
              }
            ]
          }
        },
        {
          id: 'leaks',
          title: 'Leaks',
          view: 'table',
          query: { type: 'leak' },
          sort: [{ field: 'verdict', dir: 'asc' }, { field: 'title', dir: 'asc' }],
          options: { columns: ['title', 'verdict', { field: 'cost', label: 'Cost (% a day)' }, 'fix'] }
        }
      ]
    }
  ]
}
