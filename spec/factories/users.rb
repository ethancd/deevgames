FactoryGirl.define do
  factory :user do |f|
    f.username { Faker::Name.first_name }
    f.email    { Faker::Internet.email }
    f.password { Faker::Internet.password }
    f.avatar File.new("#{Rails.root}/app/assets/images/avatars/100cat.jpg")

    initialize_with { new(attributes) }
  end
end