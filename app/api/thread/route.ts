import { NextResponse } from "next/server";
import { supabase } from "../../lib/supabase";

// Geo IP helper function to resolve country codes
async function getCountryFromIp(ip: string, headers: Headers): Promise<string> {
  // Check standard CDN geolocation headers
  const vercelCountry = headers.get("x-vercel-ip-country");
  if (vercelCountry) return vercelCountry.toUpperCase();

  const cfCountry = headers.get("cf-ipcountry");
  if (cfCountry) return cfCountry.toUpperCase();

  // Handle local development loopbacks
  if (
    ip === "127.0.0.1" ||
    ip === "::1" ||
    ip.startsWith("192.168.") ||
    ip.startsWith("10.") ||
    ip.startsWith("172.16.") ||
    ip.startsWith("172.31.")
  ) {
    return "Local";
  }

  // Fallback to free JSON geolocation API
  try {
    const response = await fetch(`http://ip-api.com/json/${ip}`, { signal: AbortSignal.timeout(2000) });
    if (response.ok) {
      const data = await response.json();
      if (data.status === "success" && data.countryCode) {
        return data.countryCode.toUpperCase();
      }
    }
  } catch (err) {
    console.error("IP Country lookup failed:", err);
  }

  return "Unknown";
}

export async function GET() {
  try {
    const { data, error } = await supabase
      .from("thread_words")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      throw error;
    }

    return NextResponse.json(data || []);
  } catch (error: any) {
    console.error("API GET Error:", error);
    return NextResponse.json({ error: "Failed to load thread data from database" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { word, author, clientIp } = body;

    // Validate word existence
    if (!word || typeof word !== "string") {
      return NextResponse.json({ error: "Word is required and must be a string." }, { status: 400 });
    }

    const cleanWord = word.trim().toLowerCase();

    // Word filter lists: bans terms relating to racism, severe abuses, and Nazi ideology
    const bannedPatterns = [
      // Nazi / Fascist / Hate groups
      /\bnazi\b/, /\bhiter\b/, /\bhitler\b/, /\bgobbel\b/, /\bgoebbels\b/, /\bhimmler\b/, /\bswastika\b/, /\bgestapo\b/, /\bss\b/, /\baryan\b/,
      // Racist slurs / hate speech (broad coverage)
      /\bnigger\b/, /\bnigga\b/, /\bchink\b/, /\bkike\b/, /\bcoon\b/, /\bwetback\b/, /\bspic\b/, /\bfag\b/, /\bfaggot\b/, /\bdyke\b/, /\btranny\b/,
      // Severe abusive / offensive slurs
      /\bretard\b/, /\bwhore\b/, /\bslut\b/, /\bcunt\b/, /\bmotherfucker\b/, /\basshole\b/, /\bbitch\b/, /\brapist\b/, /\bpedophile\b/
    ];

    const isBanned = bannedPatterns.some(pattern => pattern.test(cleanWord));
    if (isBanned) {
      return NextResponse.json({ error: "Word contains prohibited, abusive, or offensive content." }, { status: 400 });
    }

    // Validate single word constraints
    if (cleanWord.length === 0) {
      return NextResponse.json({ error: "Word cannot be empty." }, { status: 400 });
    }
    if (cleanWord.includes(" ")) {
      return NextResponse.json({ error: "Must be a single word (no spaces)." }, { status: 400 });
    }
    if (cleanWord.length > 15) {
      return NextResponse.json({ error: "Word must be 15 characters or less." }, { status: 400 });
    }

    // Clean and validate author name
    let cleanAuthor = (author || "Anonymous").trim();
    if (cleanAuthor.length > 20) {
      cleanAuthor = cleanAuthor.substring(0, 20);
    }

    // Capture requester IP address
    const xForwardedFor = request.headers.get("x-forwarded-for");
    const requestIp = xForwardedFor ? xForwardedFor.split(",")[0].trim() : "127.0.0.1";

    const isLocalIp = requestIp === "127.0.0.1" || requestIp === "::1" || requestIp.startsWith("192.168.") || requestIp.startsWith("10.");
    const ip = (isLocalIp && clientIp && clientIp !== "127.0.0.1") ? clientIp : requestIp;

    // Rate-limiting check in database: limit last word submission from the same IP (wait at least 3 seconds)
    const { data: lastIpRecord, error: rateLimitError } = await supabase
      .from("thread_words")
      .select("timestamp")
      .eq("ip", ip)
      .order("id", { ascending: false })
      .limit(1);

    if (rateLimitError) {
      console.error("Rate limit check error:", rateLimitError);
    }

    if (lastIpRecord && lastIpRecord.length > 0) {
      const timeDiff = Date.now() - new Date(lastIpRecord[0].timestamp).getTime();
      if (timeDiff < 3000) {
        return NextResponse.json({ error: "Please wait 3 seconds between submissions." }, { status: 429 });
      }
    }

    // Get client country
    const country = await getCountryFromIp(ip, request.headers);

    // Fetch the last word in the thread for Groq validation
    const { data: lastWords, error: fetchLastError } = await supabase
      .from("thread_words")
      .select("word")
      .order("id", { ascending: false })
      .limit(1);

    if (fetchLastError) {
      throw fetchLastError;
    }

    const lastWord = lastWords && lastWords.length > 0 ? lastWords[0].word : null;

    // GROQ SEMANTIC VALIDATION
    if (lastWord) {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey || apiKey === "YOUR_GROQ_API_KEY_HERE") {
        return NextResponse.json({ 
          error: "Groq API key is missing. Please add GROQ_API_KEY to your .env.local file." 
        }, { status: 500 });
      }

      try {
        const groqRes = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST",
          headers: {
            "Authorization": `Bearer ${apiKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            model: "llama-3.1-8b-instant",
            messages: [
              {
                role: "user",
                content: `You are an AI judge for a word-association chain game. The previous word is "${lastWord}" and the player wants to submit the new word "${cleanWord}". Does the word "${cleanWord}" make semantic sense, form a valid phrase, share a logical/thematic connection, or represent a creative association with the word "${lastWord}"? Respond with exactly one word: "YES" or "NO". No punctuation, explanation, or formatting.`
              }
            ],
            temperature: 0.0,
            max_tokens: 10
          })
        });

        if (!groqRes.ok) {
          const errBody = await groqRes.text();
          console.error("Groq API Error Response:", errBody);
          return NextResponse.json({ error: `Groq API error: ${groqRes.statusText}` }, { status: 502 });
        }

        const groqData = await groqRes.json();
        const responseContent = groqData.choices?.[0]?.message?.content || "";
        const judgment = responseContent.trim().toUpperCase();

        console.log(`Word Association Check: "${lastWord}" -> "${cleanWord}" | Groq Judgment: "${judgment}"`);

        if (!judgment.includes("YES") && judgment.includes("NO")) {
          return NextResponse.json({ 
            error: `Your word "${cleanWord}" does not make semantic sense with the previous word "${lastWord}".` 
          }, { status: 400 });
        }
      } catch (groqError: any) {
        console.error("Failed to connect to Groq API:", groqError);
        return NextResponse.json({ error: "Unable to contact validation server." }, { status: 502 });
      }
    }

    // Insert new word record into Supabase
    const { data: insertData, error: insertError } = await supabase
      .from("thread_words")
      .insert([
        {
          word: cleanWord,
          author: cleanAuthor,
          ip: ip,
          country: country
        }
      ])
      .select();

    if (insertError) {
      throw insertError;
    }

    const insertedRecord = insertData?.[0] || null;

    // Fetch the updated full list of words to return
    const { data: allData, error: allDataError } = await supabase
      .from("thread_words")
      .select("*")
      .order("id", { ascending: true });

    if (allDataError) {
      throw allDataError;
    }

    return NextResponse.json({ success: true, record: insertedRecord, data: allData || [] });
  } catch (error: any) {
    console.error("API POST Error:", error);
    return NextResponse.json({ error: error.message || "Failed to add word to thread" }, { status: 500 });
  }
}
