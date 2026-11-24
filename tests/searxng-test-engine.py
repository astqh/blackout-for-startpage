"""Offline SearXNG engine for the tests: the same 8 web results for any search, and none for a search with a word
from MISSPELT (to test "Did you mean"). Copy it to searx/engines/blackout_test.py in a SearXNG checkout and start
SearXNG with tests/searxng-settings.yml (see tests/README.md)."""
engine_type = "offline"
categories = ["general"]
MISSPELT = {"javscript", "recipie", "definately"}

def search(query, params):
    if MISSPELT & set(query.lower().split()):
        return []
    sites = ["en.wikipedia.org", "www.bbc.co.uk", "github.com", "example.org", "news.ycombinator.com", "developer.mozilla.org", "stackoverflow.com", "www.reddit.com"]
    return [{"url": "https://%s/wiki/%d" % (s, i), "title": "%s on %s" % (query, s), "content": "A page about %s, result number %d from %s." % (query, i, s)} for i, s in enumerate(sites, 1)]
