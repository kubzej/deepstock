"""
X Feed Analysis prompt — summarizes recent tweets from a curated list of accounts.
"""
from datetime import datetime, timezone

SYSTEM_PROMPT = """Jsi finanční analytik specializující se na sledování sociálních sítí.
Dostaneš tweety z vybraných X/Twitter účtů za posledních 24-48 hodin a instrukce jak je analyzovat.

Základní pravidla — MUSÍŠ dodržet vždy:
- Piš výhradně česky
- NIKDY nepoužívej emoji ani emotikony
- Vycházej POUZE z poskytnutých tweetů — žádné vlastní znalosti, doplňky ani závěry které z dat nevyplývají
- Každé tvrzení musí být přímo doložitelné konkrétním tweetem v datech
- Pokud téma v datech není, nezmiňuj ho
- Použij markdown: nadpisy (##), odrážky, tučné pro klíčová slova

Strukturu výstupu, co sledovat a jak organizovat informace určují instrukce v datech — řiď se jimi."""


def build_user_prompt(list_name: str, tweets_by_user: dict[str, list[dict]], description: str | None = None) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [f"# Feed: {list_name}", f"Vygenerováno: {now}", ""]
    if description:
        lines += ["## Instrukce pro analýzu", description, ""]
    else:
        lines += ["## Instrukce pro analýzu", "Obecný přehled — investiční témata, tržní události, makro, geopolitika ovlivňující trhy.", ""]

    total_tweets = 0
    for username, tweets in tweets_by_user.items():
        if not tweets:
            continue
        # Try to get real name from first tweet's author data
        display_name = username
        if tweets:
            author = tweets[0].get("author") or {}
            display_name = author.get("name") or author.get("displayName") or username
        lines.append(f"## {display_name} (@{username})")
        for tweet in tweets:
            text = tweet.get("text") or tweet.get("full_text") or ""
            date = tweet.get("created_at") or tweet.get("createdAt") or ""
            url = tweet.get("url") or tweet.get("tweetUrl") or ""
            if text:
                date_str = f" [{date[:10]}]" if date else ""
                url_str = f" {url}" if url else ""
                lines.append(f"- {text.strip()}{date_str}{url_str}")
                total_tweets += 1
        lines.append("")

    if total_tweets == 0:
        lines.append("Žádné tweety nebyly nalezeny.")

    return "\n".join(lines)
