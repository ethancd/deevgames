require "csv"

users = User.new(
  {username: "deev", email: "ethancdickinson@gmail.com", password: "12341234",
    avatar: File.new("#{Rails.root}/app/assets/images/avatars/dragon.png")},
  {username: "Ninja_Bot", email: "lalalafake@gmail.com", password: "12341234",
    avatar: File.new("#{Rails.root}/app/assets/images/avatars/100cat.jpg")},
  {username: "demo", email: "demo@example.com", password: "12341234"})

users.first.admin = true

users.each do |user| user.save! end

CSV.foreach("db/seed_data/njtrules.csv", headers: true) do |rule|
  Rule.create(rule.to_hash)
end
