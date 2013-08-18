require 'spec_helper'

describe "Comments" do
  describe "View comments" do

    before(:all) do
      u = FactoryGirl.create(:user)
      p = FactoryGirl.create(:post, body: "lorem\n"*10, author_id: u.id)
      10.times do
        FactoryGirl.create(:comment, author_id: u.id, topic_id: p.id)
      end
    end

    context "user" do

      subject(:user) { FactoryGirl.create(:user) }

      it "sees comments" do

        visit root_path

        fill_in "Email or Username", with: user.username
        fill_in "Password", with: user.password
        click_button "LOG IN"

        visit blog_path
        page.should have_content "Comments (10)"
        first('.post').click_link "Comments"

        page.should have_content "I think that"
        page.should have_content "Add new comment"
        page.should have_selector("input[type=submit][value='Submit']")

        page.should_not have_selector("input[type=submit][value='Update']")
        page.should_not have_selector("input[type=submit][value='Delete comment']")

      end
    end

    context "guest" do

      it "has restricted access" do
        visit root_path
        click_button "Play as Guest"

        visit blog_path
        first('.post').click_link "Comments"

        page.should_not have_content "Add new comment"
        page.should_not have_selector("input[type=submit][value='Submit']")

        page.should have_content "I think that"
        page.should have_content "You have to create an account to comment."
      end
    end

    context "admin" do

      subject(:user) {
        u = FactoryGirl.build(:user)
        u.admin = true
        u.save
        u
      }

      it "can moderate comments" do

        visit root_path

        fill_in "Email or Username", with: user.username
        fill_in "Password", with: user.password
        click_button "LOG IN"

        visit blog_path
        first('.post').click_link "Comments"

        page.should have_selector("input[type=submit][value='Update']")
        page.should have_selector("input[type=submit][value='Delete comment']")

      end
    end

  end
end