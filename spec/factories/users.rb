FactoryGirl.define do
  factory :admin do |f|
    f.username "deev"
    f.email "the.deep.grave@gmail.com"
    f.password "12341234"
    f.avatar File.new("#{Rails.root}/app/assets/images/pengu.jpg")
    f.admin true
  end

  factory :user do |f|
    f.username { Faker::Name.first_name }
    f.email    { Faker::Internet.email }
    f.password { Faker::Internet.password }
    f.avatar File.new("#{Rails.root}/app/assets/images/100cat.jpg")
  end
end