"""Offline SearXNG image engine for the tests: a fixed set of image results that exercise the image improvements in
the Tweaks script: small thumbnails of big images, duplicates of one picture at several sizes, a tiny image, a thin
banner, titles with and without the search words, a result two engines found, an Instagram crawler link. The pictures
come from the stand-in server (tests/fakeai.js, /img/<w>x<h>.svg). Copy to searx/engines/blackout_test_images.py."""
engine_type = "offline"
categories = ["images"]
IMG = "http://127.0.0.1:9999/img/"

def search(query, params):
    q = query.strip()
    rows = [
        # title, host, full w, full h, thumb w, thumb h
        ("Holiday snapshot", "photos.example.org", 1600, 1200, 150, 113),
        ("%s in the snow" % q, "www.example.com", 2000, 1333, 150, 100),
        ("%s portrait" % q, "img.example.net", 1200, 1800, 100, 150),
        ("%s in the snow" % q, "www.example.com", 1000, 667, 150, 100),
        ("Tiny icon", "icons.example.org", 120, 90, 120, 90),
        ("Header banner", "banners.example.org", 1600, 180, 150, 17),
        ("%s close-up" % q, "zoo.example.org", 1920, 1080, 474, 266),
        ("Our team", "lookaside.instagram.com", 1080, 1350, 120, 150),
        ("%s at the park" % q, "parks.example.org", 1500, 1000, 150, 100),
        ("%s in the snow" % q, "www.example.com", 3000, 2000, 150, 100),
        ("Random wallpaper", "walls.example.org", 1920, 1200, 474, 296),
        ("%s puppy" % q, "pets.example.org", 1280, 853, 150, 100),
    ]
    out = []
    for i, (title, host, w, h, tw, th) in enumerate(rows, 1):
        url = ("https://lookaside.instagram.com/seo/google_widget/crawler/?media_id=%d" if "instagram" in host else "https://%s/page/%d") % ((i,) if "instagram" in host else (host, i))
        out.append({"template": "images.html", "url": url, "title": title, "content": "",
                    "img_src": IMG + "%dx%d.svg?i=%d" % (w, h, i), "thumbnail_src": IMG + "%dx%d.svg?i=%d" % (tw, th, i),
                    "resolution": "%d x %d" % (w, h), "source": host})
    return out
