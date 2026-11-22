// Momento's reaction emoji: one shared list for the album page (the picker and its search) and the
// dev preview (which checks a reaction is one of these). Each entry is [emoji, name, search words].
// The first group is the original twelve, kept first and named as before.
/* eslint-disable */
// (Was public/assets/emoji.js, a plain script. Now installed by the My albums page code as it starts: browser only.)
export default function installEmoji() {
(function () {
  const GROUPS = [
    ['Popular', [
      ['😍', 'Love it', 'heart eyes love adore'], ['😂', 'Haha', 'laugh lol funny tears joy'], ['🔥', 'Fire', 'hot lit flame'],
      ['👏', 'Applause', 'clap bravo'], ['🥹', 'So sweet', 'cute aww touched tears'], ['😮', 'Wow', 'surprised shock omg'],
      ['🎉', 'Celebrate', 'party popper congrats tada'], ['🥳', 'Party', 'celebrate birthday hat'], ['❤️', 'Heart', 'love red like'],
      ['🙌', 'Hooray', 'raise hands yay praise'], ['✨', 'Sparkles', 'shine magic glitter'], ['🤩', 'Starstruck', 'star eyes amazing wow'],
    ]],
    ['Smileys', [
      ['😀', 'Grin', 'happy smile'], ['😃', 'Big smile', 'happy joy'], ['😄', 'Beaming', 'happy smile eyes'], ['😁', 'Cheesy grin', 'teeth happy'],
      ['😆', 'Giggle', 'laugh squint'], ['😅', 'Phew', 'sweat nervous laugh'], ['🤣', 'Rolling laughing', 'rofl lol funny'], ['🙂', 'Smile', 'happy'],
      ['😉', 'Wink', 'flirt joke'], ['😊', 'Blush', 'happy shy smile'], ['😇', 'Angel', 'innocent halo'], ['🥰', 'Adore', 'love hearts smile'],
      ['😘', 'Kiss', 'blow kiss love'], ['😋', 'Yum', 'tasty delicious food'], ['😛', 'Cheeky', 'tongue silly'], ['😜', 'Silly', 'wink tongue crazy'],
      ['🤪', 'Goofy', 'crazy wild zany'], ['🤗', 'Hug', 'hugs warm'], ['🤭', 'Oops', 'giggle hand mouth'], ['🤫', 'Shh', 'secret quiet'],
      ['🤔', 'Hmm', 'thinking wonder'], ['😐', 'Meh', 'neutral blank'], ['😏', 'Smirk', 'sly smug'], ['😌', 'Relieved', 'calm peaceful'],
      ['😴', 'Sleepy', 'tired zzz sleep'], ['😎', 'Cool', 'sunglasses chill'], ['🤓', 'Nerd', 'geek glasses'], ['🧐', 'Curious', 'monocle inspect'],
      ['😲', 'Astonished', 'shock wow'], ['😳', 'Flushed', 'embarrassed blush'], ['🥺', 'Pleading', 'puppy eyes please'], ['😢', 'Tear', 'sad cry'],
      ['😭', 'Sobbing', 'cry sad tears'], ['😱', 'Scream', 'shock scared omg'], ['😤', 'Huff', 'proud triumph'], ['😡', 'Angry', 'mad rage'],
      ['🤯', 'Mind blown', 'shock explode wow'], ['🥵', 'Hot', 'heat sweat spicy'], ['🥶', 'Cold', 'freezing ice'], ['😵‍💫', 'Dizzy', 'spiral woozy'],
      ['🤠', 'Cowboy', 'yeehaw hat'], ['🤡', 'Clown', 'silly joke'], ['👻', 'Ghost', 'boo spooky'], ['💀', 'Dead', 'skull lol dying'],
      ['👀', 'Eyes', 'look see watching'], ['🫠', 'Melting', 'hot embarrassed'], ['🫣', 'Peek', 'shy peeking'], ['🫶', 'Heart hands', 'love support'],
    ]],
    ['Love', [
      ['🧡', 'Orange heart', 'love'], ['💛', 'Yellow heart', 'love friendship'], ['💚', 'Green heart', 'love'], ['💙', 'Blue heart', 'love'],
      ['💜', 'Purple heart', 'love'], ['🖤', 'Black heart', 'love'], ['🤍', 'White heart', 'love'], ['🤎', 'Brown heart', 'love'],
      ['🩷', 'Pink heart', 'love'], ['💖', 'Sparkling heart', 'love sparkle'], ['💗', 'Growing heart', 'love'], ['💕', 'Two hearts', 'love'],
      ['💞', 'Revolving hearts', 'love'], ['💓', 'Beating heart', 'love'], ['💘', 'Cupid', 'love arrow'], ['💝', 'Heart gift', 'love present'],
      ['❤️‍🔥', 'Heart on fire', 'love passion'], ['💋', 'Kiss mark', 'lips love'], ['💌', 'Love letter', 'mail note'], ['💐', 'Bouquet', 'flowers wedding'],
      ['💍', 'Ring', 'wedding engaged proposal'], ['👰', 'Bride', 'wedding'], ['🤵', 'Groom', 'wedding suit'], ['💑', 'Couple', 'love together'],
    ]],
    ['Celebrate', [
      ['🎊', 'Confetti', 'party celebrate'], ['🎈', 'Balloon', 'party birthday'], ['🎂', 'Birthday cake', 'birthday party'], ['🍰', 'Cake', 'dessert slice'],
      ['🧁', 'Cupcake', 'dessert sweet'], ['🎁', 'Gift', 'present birthday'], ['🍾', 'Champagne', 'bottle cheers celebrate'], ['🥂', 'Cheers', 'toast glasses champagne'],
      ['🍻', 'Beers', 'cheers drinks'], ['🍷', 'Wine', 'drink red'], ['🍸', 'Cocktail', 'drink martini'], ['🎆', 'Fireworks', 'new year night'],
      ['🎇', 'Sparkler', 'fireworks'], ['🪩', 'Disco ball', 'dance party club'], ['💃', 'Dancer', 'dance party'], ['🕺', 'Dancing', 'dance party disco'],
      ['🎶', 'Music', 'notes song'], ['🎤', 'Mic', 'sing karaoke'], ['🎸', 'Guitar', 'music rock'], ['🎧', 'Headphones', 'music'],
      ['🏆', 'Trophy', 'win winner champion'], ['🥇', 'Gold medal', 'first winner'], ['👑', 'Crown', 'king queen royal'], ['💯', 'Hundred', 'perfect 100 score'],
      ['⭐', 'Star', 'favourite'], ['🌟', 'Glowing star', 'shine'], ['💫', 'Dizzy star', 'sparkle'], ['🎓', 'Graduation', 'grad school'],
    ]],
    ['Hands', [
      ['👍', 'Thumbs up', 'like yes good ok'], ['👎', 'Thumbs down', 'no dislike'], ['👌', 'OK', 'perfect fine'], ['🤌', 'Chef’s kiss', 'perfect italian'],
      ['✌️', 'Peace', 'victory two'], ['🤞', 'Fingers crossed', 'luck hope'], ['🤟', 'Love you', 'ily sign'], ['🤘', 'Rock on', 'metal horns'],
      ['🤙', 'Call me', 'shaka hang loose'], ['👋', 'Wave', 'hello hi bye'], ['🙏', 'Thank you', 'please pray thanks'], ['🤝', 'Handshake', 'deal agree'],
      ['💪', 'Strong', 'muscle flex gym'], ['✊', 'Fist', 'power solidarity'], ['👊', 'Fist bump', 'punch bro'], ['🫡', 'Salute', 'respect yes sir'],
    ]],
    ['Animals', [
      ['🐶', 'Dog', 'puppy pet'], ['🐱', 'Cat', 'kitten pet'], ['🐭', 'Mouse', 'animal'], ['🐰', 'Bunny', 'rabbit'], ['🦊', 'Fox', 'animal'],
      ['🐻', 'Bear', 'animal teddy'], ['🐼', 'Panda', 'animal'], ['🐨', 'Koala', 'animal'], ['🐯', 'Tiger', 'animal'], ['🦁', 'Lion', 'animal king'],
      ['🐮', 'Cow', 'animal'], ['🐷', 'Pig', 'animal'], ['🐸', 'Frog', 'animal'], ['🐵', 'Monkey', 'animal'], ['🙈', 'See no evil', 'monkey oops shy'],
      ['🐔', 'Chicken', 'bird'], ['🐧', 'Penguin', 'bird'], ['🦄', 'Unicorn', 'magic'], ['🐝', 'Bee', 'insect'], ['🦋', 'Butterfly', 'insect pretty'],
      ['🐢', 'Turtle', 'slow'], ['🐙', 'Octopus', 'sea'], ['🐬', 'Dolphin', 'sea'], ['🐳', 'Whale', 'sea'], ['🦖', 'Dinosaur', 't-rex'],
    ]],
    ['Food', [
      ['🍕', 'Pizza', 'food slice'], ['🍔', 'Burger', 'food'], ['🍟', 'Fries', 'chips food'], ['🌮', 'Taco', 'food'], ['🍣', 'Sushi', 'food japan'],
      ['🍜', 'Noodles', 'ramen food'], ['🍝', 'Pasta', 'spaghetti food'], ['🥗', 'Salad', 'food healthy'], ['🍩', 'Doughnut', 'donut sweet'], ['🍪', 'Cookie', 'biscuit sweet'],
      ['🍫', 'Chocolate', 'sweet'], ['🍦', 'Ice cream', 'dessert'], ['🍓', 'Strawberry', 'fruit'], ['🍉', 'Watermelon', 'fruit summer'], ['🍑', 'Peach', 'fruit'],
      ['🥑', 'Avocado', 'fruit'], ['☕', 'Coffee', 'tea drink'], ['🧋', 'Bubble tea', 'boba drink'], ['🍹', 'Tropical drink', 'cocktail summer'], ['🍿', 'Popcorn', 'movie snack'],
    ]],
    ['Nature', [
      ['🌸', 'Blossom', 'flower spring pink'], ['🌹', 'Rose', 'flower love'], ['🌻', 'Sunflower', 'flower summer'], ['🌷', 'Tulip', 'flower spring'], ['🌼', 'Daisy', 'flower'],
      ['🍀', 'Four leaf clover', 'luck'], ['🌿', 'Herb', 'plant green'], ['🌴', 'Palm tree', 'beach holiday'], ['🌵', 'Cactus', 'desert'], ['🍁', 'Maple leaf', 'autumn fall'],
      ['☀️', 'Sun', 'sunny weather'], ['🌈', 'Rainbow', 'pride colour'], ['🌙', 'Moon', 'night'], ['⛅', 'Cloudy', 'weather'], ['❄️', 'Snowflake', 'winter cold'],
      ['⚡', 'Lightning', 'electric zap'], ['🌊', 'Wave', 'sea ocean beach'], ['🌅', 'Sunrise', 'sunset morning'], ['🌄', 'Mountain sunrise', 'view'], ['🌍', 'Earth', 'world globe'],
    ]],
    ['Activities', [
      ['⚽', 'Football', 'soccer sport'], ['🏀', 'Basketball', 'sport'], ['🏈', 'American football', 'sport'], ['🎾', 'Tennis', 'sport'], ['🏐', 'Volleyball', 'sport'],
      ['🏓', 'Ping pong', 'table tennis'], ['🎳', 'Bowling', 'sport'], ['⛳', 'Golf', 'sport'], ['🏊', 'Swimming', 'swim pool'], ['🏄', 'Surfing', 'surf beach'],
      ['🚴', 'Cycling', 'bike'], ['🧗', 'Climbing', 'climb'], ['🎮', 'Gaming', 'video game controller'], ['🎲', 'Dice', 'game board'], ['🎯', 'Bullseye', 'target dart'],
      ['🎨', 'Art', 'paint palette'], ['📸', 'Camera flash', 'photo picture'], ['🎬', 'Action', 'film movie'], ['🎭', 'Theatre', 'drama'], ['🎪', 'Circus', 'tent'],
    ]],
    ['Travel', [
      ['✈️', 'Plane', 'flight travel holiday'], ['🚗', 'Car', 'drive road trip'], ['🚂', 'Train', 'travel'], ['🚀', 'Rocket', 'launch space'], ['⛵', 'Sailing', 'boat'],
      ['🏖️', 'Beach', 'holiday summer'], ['🏝️', 'Island', 'holiday'], ['🏔️', 'Mountain', 'snow'], ['🏕️', 'Camping', 'tent outdoors'], ['🗽', 'Statue of Liberty', 'new york'],
      ['🗼', 'Tower', 'paris tokyo'], ['🏰', 'Castle', 'palace'], ['🎡', 'Ferris wheel', 'fair'], ['🎢', 'Rollercoaster', 'theme park'], ['🌃', 'City night', 'stars'],
      ['🏠', 'Home', 'house'], ['📍', 'Pin', 'location place'], ['🗺️', 'Map', 'travel'], ['🧳', 'Luggage', 'suitcase travel'], ['🌌', 'Milky Way', 'space stars'],
    ]],
    ['Symbols', [
      ['✅', 'Check', 'yes done tick'], ['❌', 'Cross', 'no wrong'], ['❗', 'Exclamation', 'important'], ['❓', 'Question', 'what'], ['‼️', 'Double exclamation', 'wow'],
      ['💥', 'Boom', 'explosion collision'], ['💢', 'Anger', 'mad'], ['💤', 'Zzz', 'sleep tired'], ['💬', 'Speech', 'chat talk'], ['🆒', 'Cool', 'cool sign'],
      ['🆕', 'New', 'new sign'], ['🔝', 'Top', 'best'], ['♾️', 'Forever', 'infinity'], ['🍭', 'Lollipop', 'sweet candy'], ['🎀', 'Ribbon', 'bow cute'],
    ]],
  ];
  const all = [], byEmoji = Object.create(null);
  for (const [group, list] of GROUPS) for (const [e, name, words] of list) {
    if (byEmoji[e]) continue;
    const item = { e, name, group, words: (name + ' ' + words).toLowerCase() };
    all.push(item); byEmoji[e] = item;
  }
  // Search: every word typed must start a word of the emoji's name or keywords ("hea ey" finds heart eyes)
  function search(q) {
    const parts = String(q || '').toLowerCase().trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return all;
    return all.filter((it) => parts.every((p) => it.e === p || (' ' + it.words).includes(' ' + p)));
  }
  window.MomentoEmoji = { groups: GROUPS.map(([g]) => g), all, byEmoji, has: (e) => !!byEmoji[e], name: (e) => byEmoji[e]?.name, search };
})();
}
