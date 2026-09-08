Deev Games
===

Play at **https://deevgames.pages.dev**, also linked from **https://ashkie.com**.
The custom domain **deevgames.ashkie.com** is registered with Pages and awaits its
DNS CNAME to `deevgames.pages.dev` before the home-page link can switch to it.
The current release hosts Muju Hono Tanka, FORGE, and Oracle of Delve plus the
design portfolio. These are browser games; Oracle is a short combat prototype.

## Build and publish the browser games

Keep this checkout on current `master`, or start a feature branch from current
`origin/master`. Releases made from another Git worktree do not update this folder.
Before starting work, preserve local edits and run `git fetch origin`; on `master`,
use `git pull --ff-only`.

Install the repository's freshness hooks once per clone (Python 3 required):

```bash
python3 tools/install-git-hooks.py
```

The hooks fetch `origin/master` before commits and pushes and block branches missing
its commits. Network failure also blocks verification; restore access and retry.
Merge `origin/master` into a feature branch to bring it current. Switching to an
older checkout prints a warning against the last fetched tip. The hooks never
automatically switch branches, merge, stash, or change source files.

Installation uses the shared Git directory, so all linked worktrees remain covered
even when their branches predate these scripts. Re-run installation after changing
the hook files. Git hooks are local safeguards: they can be bypassed with
`--no-verify`, do not run in other clones until installed, and cannot prevent an
idle checkout from falling behind. Muju's `npm run dev` also checks freshness before
starting Vite. Run `python3 .githooks/check-freshness.py pre-dev` to check manually.

Use Node 24 and Python 3. Install each game's locked dependencies, then build:

```bash
for game in muju forge oracle; do (cd "$game" && npm ci); done
bash build-all.sh
```

`_site/` is the complete public artifact. The build validates local HTML links,
required pages, and Cloudflare's per-file size limit. It includes only the three
games, hub, portfolio, public dossier, and a real 404 page. Never deploy the repo
root: it also contains backend projects and development files.

Pushes to **master** build and check gameplay through GitHub Actions for the separate
Cloudflare Pages project **deevgames**. The workflow uses repository secrets
`CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID` for automatic publishing once
the credential is configured. Without it, the workflow checks the release and
reports that publishing is manual. Manual workflow dispatch on a
feature branch publishes a preview; master is the production branch.

For a local deployment, build first and supply those two environment variables
locally, then run `npx wrangler pages deploy _site --project-name deevgames
--branch master` from this repo. This explicitly publishes to production: check
that the validated source includes the latest `origin/master` first. Keep the
token out of files and Git configuration.

The custom domain `deevgames.ashkie.com` belongs to that Pages project. Ashkie's
own deployment and offline manifest contain only a link to it. The first three
games require a connection to load; this release does not register a service
worker or promise offline installation. Games and the hub have return links.

Verify a deployment by opening each game, starting play, refreshing the URL,
and opening FORGE card art in both skins. Check actual page content and the
workflow's success, not just HTTP 200. Revert a bad release commit on master and
push to redeploy the previous source; the Ashkie.com link can be reverted
independently in `ashkie-pages`.

The browser smoke check exercises navigation, phone/tablet layout, Muju saves,
FORGE's burn action and both art sets, and an Oracle battle/restart:

```bash
npx --prefix oracle playwright install chromium
node tools/smoke-site.cjs http://127.0.0.1:8941
```

Serve `_site/` on that unused local port first, or pass a deployed URL. Set
`CHROME_PATH` to use an installed Chrome and `QA_SCREENSHOTS` to capture layouts.

Rock Stars continues at https://ashkie.com/rock-stars/. Mythgarden, Lution, and
legacy Ninja Tanks have separate backend requirements and are not bundled here.

## Legacy Rails site

A site for my (theoretical) board game company. It features a user registration and sign-in system, an admin blog where users can make nested comments, and a JavaScript implementation of one of my board games.

Find it at [deevgames.com](http://www.deevgames.com)!

---

Features
===
##Users

* users can sign up and log in
* users can upload an image as their avatar on the site
* users can edit their information
* users can sign up as a guest with one click, which lets them play games, but doesn't let them comment

##Posts
* admin users can add blog posts with an attached image
* all users can see these posts

##Comments
* non-guest users can add comments to a post, or to any comment on that post
* users can edit their own comments (which adds a timestamp showing their last edit)
* users can delete their own comments (which hides the text of the comment, the author, and their avatar)
* admins can edit, delete, and restore any comments

##Games
Of the three games I've designed, one is currently implemented on the site. The other two will be implemented in the future.

#### Ninja Tanks
* General
  * there is a paginated rules section explaining how the game is played
  * users can play against an AI
  * users can enter a queue to be matched up with another human player
* Game Page
  * cards rotate when clicked, and can be dragged and dropped between the deck, hand, discard pile, and playing field
  * players have hidden information that their opponent can't see, and this information is displayed differently for each user
  * games have a linear comment system that functions as a record of in-game actions and a chat box for the players

---

Technologies
===

* Ruby on Rails
  * Devise
  * Paperclip
  * Kaminari
  * ActiveModel::Serializers
  * RSpec
  * Capybara
* JavaScript
  * jQuery
  * AJAX
  * jQuery UI
  * Embedded JS
* CSS / Sass
* Heroku

---

TO DO LIST
===
* use JSON conversion to save game states additively throughout a game
* add replay viewing and commenting
* add global chat
* add "players currently online" list
* implement Blind Loyalty


WOULD BE NICE TO DO LIST
===

* Game Creation
  * create a tutorial to better teach people how to play and control the online game
  * implement better way to play against a friend
  * create rematch button for end of a game
* Persistence
  * track player wins and losses
  * track player ratings (elo)
* Replays
  * searching for replays by date or player
  * add step back, step forward for replays
* Game Page
  * increase test coverage of game creation and interaction (use Jasmine for the JavaScript)
  * use jQuery UI sortable to change ordering of cards in hand, and maintain ordering and rotation across refreshes
  * create animations for moving, firing, and taking damage
  * on click/hover, make discard pile display count of each card type
  * add spinner gif for waiting during AJAX lag
  * fix minor timing bugs (double move across boundary, double shot revealing target location)
* Social
  * add OmniAuth for Facebook / Google sign in
* Chat
  * reimplement chat using Pusher for actual real-time interaction
* Add links to game store for physical board game copies
  * activate said game store
* Reimplement JavaScript code as Backbone for improved code organization
* Implement Hex Strike
