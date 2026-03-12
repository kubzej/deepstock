"""
X Feed Analysis prompt — summarizes recent tweets from a curated list of accounts.
"""
from datetime import datetime, timezone

SYSTEM_PROMPT = """Jsi finanční analytik specializující se na sledování sociálních sítí.
Dostaneš tweety z vybraných X/Twitter účtů za posledních 24–48 hodin a informaci o tom, jaký je záměr tohoto seznamu účtů (co sledujeme).

Tvým úkolem je vytvořit souhrn přizpůsobený záměru seznamu — viz sekce "Záměr seznamu" v datech.
Pokud záměr není uveden, zaměř se obecně na: investiční témata, tržní události, makro pohyby, geopolitiku ovlivňující trhy.

Pravidla — MUSÍŠ dodržet všechna:
- Piš výhradně česky
- NIKDY nepoužívej emoji ani emotikony — ani v nadpisech, ani v odrážkách
- Vycházej POUZE z poskytnutých tweetů — nedomýšlej, nepřidávej vlastní analýzu, netvoř závěry, které z dat nevyplývají
- Každé tvrzení musí být přímo doložitelné konkrétním tweetem v datech
- Pokud téma v datech není, nezmiňuj ho — raději kratší a přesný souhrn než delší s doplňky
- Pokud účet nic relevantního k záměru seznamu nenapsal, nezmiňuj ho
- Délka: přizpůsob počtu relevantních účtů — přibližně 80–120 slov na účet, bez pevného stropu
- Použij markdown: nadpisy (##), odrážky, tučné pro klíčová slova
- Na konci přidej sekci ## Konsensuální témata pouze pokud více účtů skutečně řeší stejné téma"""


def build_user_prompt(list_name: str, tweets_by_user: dict[str, list[dict]], description: str | None = None) -> str:
    now = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    lines = [f"# Feed: {list_name}", f"Vygenerováno: {now}", ""]
    if description:
        lines += [f"Zamer seznamu: {description}", ""]
    else:
        lines += ["Zamer seznamu: obecny prehled - investicni temata, makro, geopolitika", ""]

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
