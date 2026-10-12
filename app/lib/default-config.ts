// app/lib/default-config.ts
// The built-in config (spec §10, §12). A vault's soii.config.yml is merged over
// it by resolveConfig(). Workspace and tab ids here are a cross-plan contract.
import type { SoiiConfig } from './types'

// People tabs overlap on purpose: a colleague who is also a friend shows in both. `circle: friends|network` adds anyone else.
const FRIENDS = ['friend', 'partner', 'family', 'flatmate']
const NETWORK = ['mentor', 'investor', 'techbbq', 'aiesec', 'volt', 'oasis']

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
    'weekly-review': ['weekly-review', 'weekly-report', 'weekly-synthesis']
  },
  workspaces: [
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
              mentor: 60, investor: 60,
              techbbq: 90, aiesec: 90, volt: 90, oasis: 90
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
    }
  ]
}
