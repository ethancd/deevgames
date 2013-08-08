require "csv"

users = []
users.push User.new(
  {username: "deev", email: "the.deep.grave@gmail.com", password: "12341234",
    avatar: File.new("#{Rails.root}/app/assets/images/avatars/dragon.png")}
)

users.first.admin = true

users.push User.new(
  {username: "Ninja_Bot", email: "lalalafake@gmail.com", password: "12341234",
    avatar: File.new("#{Rails.root}/app/assets/images/avatars/100cat.jpg")}
)

100.times do |i|
  j = i*i-(i-1)*(i-2)+10
  users.push User.new(
    {username: "fan#{j}", email:"the#{j}fan@gmail.com", password: "12341234"})
end

users.each do |user| user.save! end

lorem = "Lorem ipsum dolor sit amet, consectetur adipisicing elit, sed do eiusmod tempor incididunt ut labore et dolore magna aliqua. Ut enim ad minim veniam, quis nostrud exercitation ullamco laboris nisi ut aliquip ex ea commodo consequat. Duis aute irure dolor in reprehenderit in voluptate velit esse cillum dolore eu fugiat nulla pariatur. Excepteur sint occaecat cupidatat non proident, sunt in culpa qui officia deserunt mollit anim id est laborum.\n"
Post.create([
  {title: "First post", author_id: 1, image_url: "http://placekitten.com/500/790",
      body: lorem*4},
  {title: "Ninja Tanks Discussion!", author_id: 1, image_url: "http://placekitten.com/345/1000",
      body: "This is the top-level post to discuss Ninja Tanks.\nAlso, " + lorem*3},
  {title: "Third post", author_id: 1, image_url: "http://placekitten.com/200/200",
      body: lorem*2},
  {title: "Fourth post", author_id: 1, image_url: "http://placekitten.com/654/223",
      body: lorem*8},
  {title: "Fifth post", author_id: 1, image_url: "http://placekitten.com/500/790",
      body: lorem*4},
  {title: "Sixth post", author_id: 1, image_url: "http://placekitten.com/345/1000",
      body: lorem*3}
])

96.times do |i|
  p_id = i < 36 ? nil : i - 35
  Comment.create(
    {author_id: i+1, topic_type: "Post", topic_id: "#{i%6+1}", parent_id: p_id,
      body: "#{i * 2} this is pretty great #{i / 2}"}
  )
end

CSV.foreach("db/seed_data/njtrules.csv", headers: true) do |rule|
  Rule.create(rule.to_hash)
end
