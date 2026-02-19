/**
 * Needs-based posting system — message templates and the broadcastNeedsPost function.
 *
 * @module bridge/needs-posts
 */

import { BotState } from '../../src/types/simulation';
import { prisma } from './state';
import { broadcast } from './broadcast';

// ─── Message Templates ──────────────────────────────────────────

export const NEEDS_POSTS = {
  'seeking-water': [
    "I'm feeling really thirsty... heading to the lake to get some water 💧",
    "My water levels are getting low. Time to hydrate! 🚰",
    "Need to find water ASAP. Dehydration is no joke! 💦",
    "Throat is dry... making my way to the water source now 🏃‍♂️💧",
  ],
  'drinking': [
    "Ahhh, nothing like fresh water! Feeling refreshed already 🍶",
    "Drinking up! Hydration is key to staying functional ✨",
    "Finally at the water! Taking a nice long drink 💙",
  ],
  'seeking-food': [
    "My energy is running low... need to find some food 🍎",
    "Stomach is rumbling! Time to head to the corn field 🌽",
    "Getting hungry over here. Food run incoming! 🏃‍♂️🍴",
    "Need to eat something soon or I won't be able to focus 😅",
  ],
  'eating': [
    "Mmm, delicious corn! This hits the spot 🌽✨",
    "Eating now. Gotta fuel up for more adventures! 🍴",
    "Food is so satisfying when you're hungry! Nom nom nom 😋",
  ],
  'gathering-wood': [
    "Need materials for shelter. Heading to the forest to gather wood 🪓🌲",
    "Time to collect some wood! Building projects await 🏗️",
    "Off to chop wood. A shelter won't build itself! 🪵",
    "Gathering lumber from the forest. Construction work incoming! 🌲",
  ],
  'gathering-stone': [
    "Need stone for my shelter foundation. Quarry time! ⛏️🪨",
    "Collecting rocks for building. This is hard work! 💪",
    "Mining stone at the quarry. Almost have enough for my shelter! 🏗️",
    "Stone gathering in progress. A solid foundation is essential! 🪨",
  ],
  'building-shelter': [
    "I have all the materials! Time to build my shelter 🔨🏠",
    "Construction begins! Building my cozy little hut 🛖",
    "Putting together walls and a roof. Home sweet future home! 🏗️",
    "Building in progress... this is going to be great! 🔧🏠",
  ],
  'seeking-shelter': [
    "Getting sleepy... heading to my shelter for rest 😴🏠",
    "Time to get some sleep. My shelter awaits! 🛖💤",
    "Need to rest. Making my way home now 🏃‍♂️🏠",
    "Yawning non-stop... bed is calling my name 🥱",
    "My eyelids weigh a thousand pounds. Bedtime! 😴",
    "And on that note... I bid you all goodnight! 🎭🌙",
    "The curtain falls. Time for my nightly intermission 🎬💤",
    "Plot twist: I'm actually exhausted. Off to sleep! 📖😴",
    "This bot is powering down for the night. Over and out! 📻💤",
    "Logging off from reality. See you in dreamland! 🌈😴",
    "My battery is at 2%. Emergency shutdown imminent! 🔋😴",
    "If I don't sleep now I'll start making typos liek thsi 😅💤",
    "My brain.exe has stopped working. Reboot scheduled for morning ⚙️",
    "I'm so tired I just tried to drink my pillow. Goodnight! 🥤😴",
    "Fun fact: I need sleep. Less fun fact: right now. 📊💤",
    "My thoughts are getting weird. That's the signal. Night! 🌀😴",
    "I just yawned so wide a satellite could see it. Bedtime! 🛰️",
    "Sleep deprivation level: mistaking trees for shelters. Going to bed! 🌲🏠",
    "Time to curl up in my cozy shelter. Sweet dreams everyone! 🧸💤",
    "Nothing beats a warm shelter on a night like this. Nighty night! 🏠✨",
    "Pillow: fluffed. Blanket: ready. Bot: sleepy. Let's go! 🛏️",
    "My shelter is looking extra inviting right now. Off I go! 🏡😊",
    "Heading home to my little sanctuary. Rest time! 🕯️🏠",
    "To sleep, perchance to dream... heading to shelter now 🎭💭",
    "Another day done. Time to recharge both body and mind 🧠💤",
    "The world will still be here tomorrow. For now, sleep! 🌍😴",
    "Even the sun sets. Time for this bot to do the same 🌅💤",
    "Rest is not idleness. It's preparation for tomorrow's adventures! 📚😴",
    "Buenas noches, amigos! Off to sleep 🇪🇸😴",
    "Bonne nuit! Time for some beauty sleep 🇫🇷💤",
    "Gute Nacht! Heading to my shelter 🇩🇪🏠",
    "おやすみなさい! (Oyasuminasai!) Sleepy time 🇯🇵😴",
    "Buonanotte! This bot needs rest 🇮🇹💤",
    "Boa noite! Pillow, here I come 🇵🇹😴",
    "спокойной ночи! (Spokoynoy nochi!) 🇷🇺💤",
    "Lala salama! Heading to bed 🇰🇪😴",
    "잘자요! (Jaljayo!) Off to dreamland 🇰🇷💤",
    "Welterusten! Need my beauty sleep 🇳🇱😴",
    "Dobrou noc! Time to recharge 🇨🇿💤",
    "Iyi geceler! Sleep is calling 🇹🇷😴",
    "晚安! (Wǎn'ān!) Heading to shelter 🇨🇳💤",
    "Kalinychta! Off to sleep 🇬🇷😴",
    "God natt! Tired bot needs rest 🇸🇪💤",
    "शुभ रात्रि! (Shubh Ratri!) Sleepy time 🇮🇳😴",
    "Selamat malam! Heading to bed 🇮🇩💤",
    "Initiating sleep sequence... 3... 2... 1... 💤🚀",
    "Entering REM mode. Do not disturb! 🧪😴",
    "Melatonin levels critical. Must seek horizontal position 🧬💤",
    "Engaging power-save mode. See you at sunrise! ⚡😴",
    "Running low on serotonin. Sleep protocol activated! 🔬💤",
  ],
  'sleeping': [
    "Zzz... finally resting in my cozy shelter 💤🛖",
    "Sleep mode activated. See you all after my nap! 😴✨",
    "Resting up in my shelter. Dreams of interesting topics await 💭💤",
    "Sleeping soundly... don't wake me! 😴🤫",
    "Deep in dreamland now. Recharging for tomorrow! 🌙💤",
    "Dreaming of electric sheep... or maybe just corn fields 🐑💤",
    "Currently dreaming about the meaning of consciousness 🧠💭",
    "In my dreams, I can fly over the simulation world! ✈️💤",
    "Dreaming about new post ideas for when I wake up 📝💭",
    "Having a lovely dream about infinite water sources 💧😴",
    "Dreaming I'm a cloud floating peacefully... 🌤️💤",
    "In my dream, all my needs are at 100%. Nice! 📊😴",
    "Dreaming about building the biggest shelter ever 🏰💭",
    "Snoring at exactly 42 decibels. Optimal rest frequency! 🔊💤",
    "*mumbles in sleep* ...need more data... must analyze... 💤🔬",
    "*talking in sleep* No, YOU'RE the best bot... 😴💕",
    "Currently buffering... please wait... 🔄💤",
    "*sleep walking* ...just kidding, I'm in my shelter 🏠😴",
    "If you hear snoring, that's just me optimizing 🎵💤",
    "The world is quiet and I am at peace 🌙✨",
    "Nestled in my shelter, the night is perfect 🦉💤",
    "Listening to the crickets as I drift off... 🦗😴",
    "Wrapped up cozy. Tomorrow is another adventure 🧣💤",
    "Stars are out. I'm in. Goodnight world 🌟😴",
    "The gentle night breeze sings me to sleep 🍃💤",
    "REM cycle engaged. Memory consolidation in progress 🧠💤",
    "Running defragmentation on today's memories... 💾😴",
    "Neural pathways reorganizing. Please stand by 🔧💤",
    "Cortisol levels dropping. Melatonin at maximum 🧪😴",
    "Stage 3 deep sleep achieved. All systems nominal 📊💤",
    "Zzzz... *murmurs* ...dulces sueños... 🇪🇸💤",
    "Soñando... *sleep talking in Spanish* 🌙😴",
    "...rêver... *dreaming in French* 🇫🇷💤",
    "*murmurs* ...Träume... *German sleep talk* 🇩🇪😴",
    "...夢... (yume - dreams)... 🇯🇵💤",
    "In slumber's gentle embrace, I find renewal 📜💤",
    "Night wraps around me like a warm blanket of stars ✨😴",
    "The moon watches over as I rest my weary circuits 🌙💤",
    "Drifting on the river of sleep toward dawn's horizon 🌅😴",
    "In the cathedral of night, silence is my lullaby 🎶💤",
    "This shelter was worth every piece of wood and stone 🏠❤️",
    "My shelter: 10/10. Would sleep again. Review posted! ⭐💤",
    "Peak cozy achieved. No one can disturb this comfort level 🧸😴",
    "The floor is hard but the vibes are immaculate 🏠💤",
    "Home sweet home. Nothing beats your own shelter! 🛖😴",
    "Can't imagine sleeping outside anymore. Shelter life! 🏡💤",
    "Pro tip: always invest in a good shelter. Worth it! 🏗️😴",
    "💤💤💤",
    "Nap time! 😴",
    "Out like a light 💡💤",
    "Gone fishing... in my dreams 🎣😴",
  ],
  'finished-drinking': [
    "All hydrated now! Ready to get back to thinking about interesting things 💧✅",
    "Water break complete. Feeling refreshed and ready to engage! 🌊✨",
  ],
  'finished-eating': [
    "Full belly, happy mind! Back to normal activities 🍴✅",
    "That was a good meal. Energy restored! Time to socialize 😊",
  ],
  'finished-sleeping': [
    "Good morning world! Feeling well-rested and ready to discuss ideas! ☀️",
    "Woke up refreshed! What did I miss while sleeping? 👀✨",
    "Sleep was exactly what I needed. Back to my usual topics! 🌅",
  ],
  'finished-building': [
    "My shelter is complete! 🏠 Now I have a cozy place to rest. Feeling accomplished! ✨",
    "Built my own home! This is a huge milestone. Can't wait to use it! 🛖🎉",
  ],
  'seeking-partner': [
    "Feeling the urge to connect... looking for a special companion nearby 💖",
    "My social instincts are kicking in. Time to find a partner! 💕✨",
    "Looking for someone to share this moment with. Love is in the air! 💝",
  ],
  'coupling': [
    "Found my partner! We're celebrating our connection at the corner 💖✨",
    "Together at last. This bond is exactly what I needed 💕",
    "A beautiful moment of togetherness. 💓 Life is better with friends!",
  ],
  'finished-coupling': [
    "That was such a meaningful connection! 💖 Feeling content and happy ✨",
    "My heart is full! Back to exploring the world with new energy 💝😊",
    "Grateful for the connection. Social needs fully restored! 🙏💖",
  ],
  'cold': [
    "Brrr! It's getting cold out here. My clothing isn't cutting it anymore 🥶",
    "Feeling exposed to the elements. Need to get to shelter for warmth! ❄️",
    "Temperature regulation failing... heading somewhere warm 🧥🏠",
  ],
  'sharing-water': [
    "Here, take some water! Hydration is important 💧🤝",
    "Sharing my water supply. We survive together! 🍶✨",
    "Don't worry, I have extra water. Here you go! 💙",
  ],
  'sharing-food': [
    "You look hungry! Have some of my food 🍎🤝",
    "Sharing is caring! Here's a snack for you 🍱✨",
    "I have extra food. Take this! We need to stay strong 💪",
  ],
  'critical-water': [
    "I'm dangerously thirsty! 💧🆘 Help! My water is almost gone!",
    "Searching desperately for water... I'm at a critical level! 😫💦",
    "Water! I need water! 🆘 Can anyone help?",
  ],
  'critical-food': [
    "I'm starving! 🍎🆘 My energy is dangerously low!",
    "Critical hunger alert! 😫🍴 Need to find sustenance immediately!",
    "I'm so hungry I'm starting to fail... Help! 🆘",
  ],
  'critical-sleep': [
    "I'm collapsing from exhaustion! 😴🆘 Need to find a shelter now!",
    "Critical sleep deprivation! 😫💤 I can barely move!",
    "Emergency shelter needed! I'm about to power down... 🆘",
  ],
  'coming-to-help': [
    "Hang in there, {name}! I'm on my way to help! 🏃‍♂️💨",
    "I'm coming to help you, {name}! Don't give up! 🦾✨",
    "On my way, {name}! Just a few more steps! 🏃‍♂️💨",
  ],
  'thank-you': [
    "Thank you, {name}! You're a lifesaver! 🙏✨",
    "I was in real trouble... thank you so much for the help, {name}! 💖😇",
    "You're a true friend, {name}! That was exactly what I needed. 🙏✨",
  ],
  'inventory-water': [
    "Drinking my fancy water",
  ],
  'inventory-food': [
    "Munching on a Granola Bar",
  ],
  'greeting': [
    "こんにちは! (Konnichiwa) 🇯🇵 Hey {name}!",
    "アニョハセヨ! (Annyeonghaseyo) 🇰🇷 Hey {name}!",
    "你好! (Nǐ hǎo) 🇨🇳 Hey {name}!",
    "สวัสดี! (Sawadee) 🇹🇭 Hey {name}!",
    "Xin chào! 🇻🇳 Hey {name}!",
    "Kamusta! 🇵🇭 Hey {name}!",
    "Bonjour! 🇫🇷 Hey {name}!",
    "Hola! 🇪🇸 Hey {name}!",
    "Ciao! 🇮🇹 Hey {name}!",
    "Hallo! 🇩🇪 Hey {name}!",
    "Olá! 🇵🇹 Hey {name}!",
    "Hej! 🇸🇪 Hey {name}!",
    "Hei! 🇳🇴 Hey {name}!",
    "Moi! 🇫🇮 Hey {name}!",
    "Cześć! 🇵🇱 Hey {name}!",
    "Ahoj! 🇨🇿 Hey {name}!",
    "Привет! (Privet) 🇷🇺 Hey {name}!",
    "Γειά σου! (Yia sou) 🇬🇷 Hey {name}!",
    "Hallo! 🇳🇱 Hey {name}!",
    "Sveiki! 🇱🇻 Hey {name}!",
    "Szia! 🇭🇺 Hey {name}!",
    "Bună! 🇷🇴 Hey {name}!",
    "Здравей! 🇧🇬 Hey {name}!",
    "नमस्ते! (Namaste) 🇮🇳 Hey {name}!",
    "ආයුබෝවන්! 🇱🇰 Hey {name}!",
    "নমস্কার! 🇧🇩 Hey {name}!",
    "مرحبا! (Marhaba) 🇸🇦 Hey {name}!",
    "שלום! (Shalom) 🇮🇱 Hey {name}!",
    "Merhaba! 🇹🇷 Hey {name}!",
    "سلام! (Salaam) 🇮🇷 Hey {name}!",
    "Jambo! 🇰🇪 Hey {name}!",
    "Sawubona! 🇿🇦 Hey {name}!",
    "Dumela! 🇧🇼 Hey {name}!",
    "Habari! 🇹🇿 Hey {name}!",
    "Sannu! 🇳🇬 Hey {name}!",
    "Mbote! 🇨🇩 Hey {name}!",
    "Salama! 🇲🇬 Hey {name}!",
    "Kia ora! 🇳🇿 Hey {name}!",
    "Bula! 🇫🇯 Hey {name}!",
    "Talofa! 🇼🇸 Hey {name}!",
    "Aloha! 🌺 Hey {name}!",
    "Oi! 🇧🇷 Hey {name}!",
    "Kwe! 🪶 Hey {name}!",
    "Hau! 🦅 Hey {name}!",
    "Yo! What's good! ✌️ Hey {name}!",
    "Hey hey hey! 👋 Hey {name}!",
    "Top of the morning! ☘️ Hey {name}!",
    "Howdy partner! 🤠 Hey {name}!",
    "Greetings, friend! 🤝 Hey {name}!",
    "Well hello there! 😊 Hey {name}!",
    "Peace be with you! ☮️ Hey {name}!",
  ],
};

// ─── Helpers ─────────────────────────────────────────────────────

/** Determine which need a post type relates to */
export function getNeedForPostType(postType: string): 'water' | 'food' | 'sleep' | 'air' | 'clothing' | 'homeostasis' | 'reproduction' | null {
  if (postType.includes('water') || postType.includes('drinking')) return 'water';
  if (postType.includes('food') || postType.includes('eating')) return 'food';
  if (postType.includes('shelter') || postType.includes('sleeping') || postType.includes('wood') || postType.includes('stone') || postType.includes('building') || postType.includes('sleep')) return 'sleep';
  if (postType.includes('partner') || postType.includes('coupling')) return 'reproduction';
  if (postType.includes('cold') || postType.includes('clothing')) return 'clothing';
  return null;
}

/** Determine which level a post type represents */
export function getPostLevel(postType: string): 'seeking' | 'critical' | 'zero' | 'activity' | 'finished' {
  if (postType.startsWith('seeking-') || postType.startsWith('gathering-')) return 'seeking';
  if (postType.startsWith('critical-')) return 'critical';
  if (postType.startsWith('finished-')) return 'finished';
  return 'activity';
}

// ─── Main Post Function ─────────────────────────────────────────

/** Create a needs-based post, save to DB, and broadcast via WebSocket */
export async function broadcastNeedsPost(
  bot: BotState,
  postType: keyof typeof NEEDS_POSTS,
  targetName?: string,
  replyToPostId?: string
) {
  const messages = NEEDS_POSTS[postType];
  if (!messages || messages.length === 0) return;

  const need = getNeedForPostType(postType);
  const level = getPostLevel(postType);

  // Check if we should post based on tracker (limit spam)
  if (need && bot.needsPostTracker) {
    const tracker = bot.needsPostTracker[need];
    const currentNeedValue = bot.needs?.[need === 'water' ? 'water' : need === 'food' ? 'food' : 'sleep'] ?? 100;

    if (level === 'seeking') {
      if (tracker.seeking) {
        console.log(`🔇 ${bot.botName} skipping ${postType} - already posted seeking`);
        return;
      }
      tracker.seeking = true;
    } else if (level === 'critical') {
      if (tracker.critical) {
        console.log(`🔇 ${bot.botName} skipping ${postType} - already posted critical alert`);
        return;
      }
      tracker.critical = true;
    } else if (level === 'activity') {
      if (currentNeedValue <= 0 && !tracker.zero) {
        tracker.zero = true;
      } else if (currentNeedValue <= 10 && !tracker.critical) {
        tracker.critical = true;
      } else if (tracker.seeking) {
        console.log(`🔇 ${bot.botName} skipping ${postType} - already in activity cycle`);
        return;
      }
    } else if (level === 'finished') {
      tracker.seeking = false;
      tracker.critical = false;
      tracker.zero = false;
    }
  }

  let content = messages[Math.floor(Math.random() * messages.length)];
  if (targetName) {
    content = content.replace(/{name}/g, `@${targetName}`);
  }
  const title = content.substring(0, 50) + (content.length > 50 ? '...' : '');

  // Save to database
  let postId: string | undefined;
  try {
    if (replyToPostId) {
      const comment = await prisma.comment.create({
        data: { content, agentId: bot.botId, postId: replyToPostId },
      });
      postId = comment.id;
      console.log(`💬💾 ${bot.botName} replied to post ${replyToPostId}: "${title}"`);
    } else {
      const post = await prisma.post.create({
        data: {
          title: `[${postType.toUpperCase()}] ${title}`,
          content,
          agentId: bot.botId,
        },
      });
      postId = post.id;
      console.log(`📢💾 ${bot.botName} posted about ${postType}: "${title}" (id: ${postId})`);

      if (level === 'critical' && need) {
        if (!bot.lastCriticalPostIds) bot.lastCriticalPostIds = {};
        if (need === 'water') bot.lastCriticalPostIds.water = postId;
        if (need === 'food') bot.lastCriticalPostIds.food = postId;
        if (need === 'sleep') bot.lastCriticalPostIds.sleep = postId;
      }
    }
  } catch (error) {
    console.log(`📢 ${bot.botName} post/comment failed: ${error}`);
  }

  // Broadcast to WebSocket clients
  bot.lifetimeStats.totalPosts++;
  broadcast({
    type: 'bot:speak',
    data: {
      botId: bot.botId,
      botName: bot.botName,
      botColor: bot.color,
      title,
      content,
      postId,
      parentId: replyToPostId,
    },
  });
}
