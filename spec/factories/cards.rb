# Read about factories at https://github.com/thoughtbot/factory_girl

FactoryGirl.define do
  factory :card do
    dir "MyString"
    value 1
    player_id 1
    game_id 1
    location "MyString"
    shot false
  end
end
